"""Isolated API regression checks; never touch the running site's database."""
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import wave
from http.server import ThreadingHTTPServer


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('community_api', ROOT / 'server/api_server.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class CommunityAPI(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='geomelody-api-test-')
        api.DATA_DIR = os.path.join(self.temp.name, 'data')
        api.UPLOADS_DIR = os.path.join(self.temp.name, 'uploads')
        api.UPLOADS_AUDIO = os.path.join(api.UPLOADS_DIR, 'audio')
        api.UPLOADS_COVERS = os.path.join(api.UPLOADS_DIR, 'covers')
        api.DB_PATH = os.path.join(api.DATA_DIR, 'community_spots.db')
        api.init_db()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), api.GeoMelodyHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.server.server_port)
        out = io.BytesIO()
        with wave.open(out, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(8000)
            wav.writeframes(b'\0\0' * 800)
        self.audio = out.getvalue()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path, body=None, headers=None):
        try:
            response = urllib.request.urlopen(urllib.request.Request(self.base + path, data=body, headers=headers or {}))
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def publish(self, lat='0', lng='-45.25', audio=True):
        boundary = 'geomelody-test-boundary'
        fields = {'title': 'Synthetic fixture', 'description': 'Temporary test', 'currentLat': lat, 'currentLng': lng}
        chunks = []
        for name, value in fields.items():
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        if audio:
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="audio"; filename="test.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode() + self.audio + b'\r\n')
        chunks.append(f'--{boundary}--\r\n'.encode())
        return self.request('/api/community/publish', b''.join(chunks), {'Content-Type': f'multipart/form-data; boundary={boundary}', 'Origin': 'http://127.0.0.1:5173'})

    def test_upload_visible_to_anonymous_visitor(self):
        status, result = self.publish()
        self.assertEqual(status, 201)
        _, public = self.request('/api/community/spots')
        spot = public['spots'][0]
        self.assertEqual(spot['id'], result['spot']['id'])
        self.assertEqual((spot['lat'], spot['lng']), (0, -45.25))
        with urllib.request.urlopen(self.base + spot['audioTrack']['url']) as response:
            self.assertEqual(response.read(), self.audio)

    def test_missing_audio_rejected(self):
        status, result = self.publish(audio=False)
        self.assertEqual((status, result['code']), (400, 'AUDIO_REQUIRED'))
        self.assertEqual(self.request('/api/community/spots')[1]['spots'], [])

    def test_invalid_coordinates_never_default_to_hangzhou(self):
        for lat, lng in [('', '1'), ('NaN', '1'), ('91', '1'), ('1', 'inf'), ('1', '-181')]:
            with self.subTest(lat=lat, lng=lng):
                status, result = self.publish(lat, lng)
                self.assertEqual((status, result['code']), (400, 'INVALID_COORDINATES'))
        self.assertEqual(os.listdir(api.UPLOADS_AUDIO), [])

    def test_pagination_preserves_older_spots(self):
        self.publish()
        with api.get_connection() as db:
            columns = ','.join(row[1] for row in db.execute('PRAGMA table_info(spots)'))
            original = list(db.execute('SELECT * FROM spots').fetchone())
            for i in range(204):
                row = original.copy()
                row[0] = f'fixture-{i}'
                db.execute(f'INSERT INTO spots ({columns}) VALUES ({",".join("?" for _ in row)})', row)
        _, first = self.request('/api/community/spots')
        self.assertEqual(len(first['spots']), 200)
        # A new upload between page requests must not shift the second page.
        self.publish()
        _, second = self.request('/api/community/spots?cursor=' + first['nextCursor'])
        self.assertEqual(len(second['spots']), 5)
        self.assertIsNone(second['nextCursor'])
        self.assertEqual(len({s['id'] for s in first['spots'] + second['spots']}), 205)
        self.assertEqual(self.request('/api/community/spots?cursor=invalid')[0], 400)

    def test_unknown_origins_still_rejected(self):
        status, result = self.request('/api/community/publish', b'', {'Origin': 'https://untrusted.example'})
        self.assertEqual((status, result['code']), (403, 'ORIGIN_NOT_ALLOWED'))


if __name__ == '__main__':
    unittest.main()
