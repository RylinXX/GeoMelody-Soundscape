#!/usr/bin/env python3
"""GeoMelody community API for shared spots, media, and comments."""

import cgi
import json
import math
import mimetypes
import os
import re
import shutil
import sqlite3
import sys
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('GEOMELODY_DATA_DIR', os.path.join(BASE_DIR, 'data'))
UPLOADS_DIR = os.environ.get('GEOMELODY_UPLOADS_DIR', os.path.join(BASE_DIR, 'uploads'))
UPLOADS_COVERS = os.path.join(UPLOADS_DIR, 'covers')
UPLOADS_AUDIO = os.path.join(UPLOADS_DIR, 'audio')
DB_PATH = os.path.join(DATA_DIR, 'community_spots.db')

MAX_COVER_BYTES = int(os.environ.get('GEOMELODY_MAX_COVER_BYTES', 10 * 1024 * 1024))
MAX_AUDIO_BYTES = int(os.environ.get('GEOMELODY_MAX_AUDIO_BYTES', 48 * 1024 * 1024))
MAX_REQUEST_BYTES = int(os.environ.get('GEOMELODY_MAX_REQUEST_BYTES', 60 * 1024 * 1024))
SERVER_HOST = os.environ.get('GEOMELODY_HOST', '127.0.0.1')

DEFAULT_ORIGINS = (
    'https://etgq.com,https://www.etgq.com,'
    'http://localhost:5173,http://127.0.0.1:5173'
)
ALLOWED_ORIGINS = {
    value.strip()
    for value in os.environ.get('GEOMELODY_ALLOWED_ORIGINS', DEFAULT_ORIGINS).split(',')
    if value.strip()
}

EMOJI_PATTERN = re.compile(
    '[\U0001F1E6-\U0001F1FF\U0001F300-\U0001FAFF\u2300-\u23FF\u2600-\u27BF]+'
)


def strip_emoji(value):
    text = EMOJI_PATTERN.sub('', str(value or ''))
    text = text.replace('\ufe0e', '').replace('\ufe0f', '').replace('\u200d', '')
    return re.sub(r'\s{2,}', ' ', text).strip()


def sanitize_json_text(value):
    if isinstance(value, str):
        return strip_emoji(value)
    if isinstance(value, list):
        return [sanitize_json_text(item) for item in value]
    if isinstance(value, dict):
        return {key: sanitize_json_text(item) for key, item in value.items()}
    return value

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'}
AUDIO_EXTENSIONS = {'.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac', '.webm'}
CHUNK_SIZE = 1024 * 1024


class RequestError(Exception):
    def __init__(self, message, status=400, code='BAD_REQUEST'):
        super().__init__(message)
        self.status = status
        self.code = code


def ensure_directories():
    for directory in (DATA_DIR, UPLOADS_DIR, UPLOADS_COVERS, UPLOADS_AUDIO):
        os.makedirs(directory, exist_ok=True)


def get_connection():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.execute('PRAGMA busy_timeout = 10000')
    return connection


def init_db():
    ensure_directories()
    with get_connection() as connection:
        connection.execute('PRAGMA journal_mode = WAL')
        connection.execute('''
            CREATE TABLE IF NOT EXISTS spots (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                en_name TEXT,
                author TEXT NOT NULL,
                location TEXT,
                country TEXT,
                category TEXT,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                description TEXT,
                tags TEXT,
                photos TEXT,
                audio_track TEXT,
                created_at INTEGER
            )
        ''')
        connection.execute('''
            CREATE TABLE IF NOT EXISTS comments (
                id TEXT PRIMARY KEY,
                spot_id TEXT NOT NULL,
                author TEXT NOT NULL,
                en_author TEXT,
                text TEXT NOT NULL,
                en_text TEXT,
                likes INTEGER DEFAULT 0,
                reply_to_id TEXT,
                created_at TEXT
            )
        ''')
        connection.execute('CREATE INDEX IF NOT EXISTS idx_spots_created_at ON spots(created_at DESC)')
        connection.execute('CREATE INDEX IF NOT EXISTS idx_comments_spot_id ON comments(spot_id, created_at DESC)')


def json_load(value, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback


def clean_text(value, max_length, fallback=''):
    text = strip_emoji(str(value or '').replace('\x00', ''))
    return text[:max_length] or fallback


def parse_float(value, fallback, minimum, maximum):
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = fallback
    if not math.isfinite(number) or number < minimum or number > maximum:
        raise RequestError('地图坐标超出有效范围', 400, 'INVALID_COORDINATES')
    return number


def required_coordinate(value, minimum, maximum):
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise RequestError('请确认有效的发布坐标', 400, 'INVALID_COORDINATES')
    return parse_float(number, 0, minimum, maximum)


def format_location(lat, lng):
    lng_direction = 'E' if lng >= 0 else 'W'
    lat_direction = 'N' if lat >= 0 else 'S'
    return f'坐标 · {abs(lng):.2f}°{lng_direction}, {abs(lat):.2f}°{lat_direction}'


def get_form_item(form, key):
    if key not in form:
        return None
    item = form[key]
    return item[0] if isinstance(item, list) else item


def has_valid_signature(header, extension, kind):
    if kind == 'cover':
        return (
            header.startswith(b'\xff\xd8\xff') or
            header.startswith(b'\x89PNG\r\n\x1a\n') or
            header.startswith((b'GIF87a', b'GIF89a')) or
            (header.startswith(b'RIFF') and header[8:12] == b'WEBP') or
            (b'ftypavif' in header or b'ftypavis' in header)
        )
    return (
        header.startswith(b'ID3') or
        (len(header) >= 2 and header[0] == 0xFF and (header[1] & 0xE0) == 0xE0) or
        header.startswith(b'OggS') or
        (header.startswith(b'RIFF') and header[8:12] == b'WAVE') or
        header.startswith(b'fLaC') or
        header.startswith(b'\x1aE\xdf\xa3') or
        b'ftyp' in header
    )


def save_uploaded_file(item, kind):
    if item is None or not getattr(item, 'filename', None):
        return '', None

    original_name = os.path.basename(item.filename)
    extension = os.path.splitext(original_name)[1].lower()
    allowed_extensions = IMAGE_EXTENSIONS if kind == 'cover' else AUDIO_EXTENSIONS
    max_bytes = MAX_COVER_BYTES if kind == 'cover' else MAX_AUDIO_BYTES
    target_dir = UPLOADS_COVERS if kind == 'cover' else UPLOADS_AUDIO
    expected_prefix = 'image/' if kind == 'cover' else 'audio/'
    declared_type = clean_text(getattr(item, 'type', ''), 100).lower()

    if extension not in allowed_extensions:
        raise RequestError('不支持的媒体文件格式', 415, 'UNSUPPORTED_MEDIA_TYPE')
    if declared_type and not declared_type.startswith(expected_prefix) and declared_type not in {
        'application/octet-stream', 'application/ogg'
    }:
        raise RequestError('媒体文件类型不正确', 415, 'INVALID_MEDIA_TYPE')

    header = item.file.read(32)
    item.file.seek(0)
    if not has_valid_signature(header, extension, kind):
        raise RequestError('媒体文件内容与格式不匹配', 415, 'INVALID_MEDIA_CONTENT')

    filename = f'{int(time.time())}_{uuid.uuid4().hex}{extension}'
    destination = os.path.join(target_dir, filename)
    temporary = f'{destination}.part'
    written = 0

    try:
        with open(temporary, 'xb') as output:
            while True:
                chunk = item.file.read(CHUNK_SIZE)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise RequestError(
                        '封面不能超过 10MB' if kind == 'cover' else '音频不能超过 48MB',
                        413,
                        'FILE_TOO_LARGE'
                    )
                output.write(chunk)
        if written == 0:
            raise RequestError('上传文件为空', 400, 'EMPTY_FILE')
        os.replace(temporary, destination)
    except Exception:
        for path in (temporary, destination):
            try:
                if os.path.exists(path):
                    os.unlink(path)
            except OSError:
                pass
        raise

    public_url = f"/uploads/{'covers' if kind == 'cover' else 'audio'}/{filename}"
    return public_url, destination


def normalize_local_media_url(value, kind):
    value = clean_text(value, 500)
    expected = '/uploads/covers/' if kind == 'cover' else '/uploads/audio/'
    return value if value.startswith(expected) and '..' not in value else ''


def spot_from_row(row):
    photos = sanitize_json_text(json_load(row[11], []))
    audio_track = sanitize_json_text(json_load(row[12], None))
    tags = sanitize_json_text(json_load(row[10], ['用户投稿', 'Community']))
    return {
        'id': row[0],
        'name': strip_emoji(row[1]),
        'enName': strip_emoji(row[2] or row[1]),
        'author': strip_emoji(row[3]),
        'location': strip_emoji(row[4]),
        'country': row[5] or '当前位置',
        'category': row[6] or 'town',
        'lat': row[7],
        'lng': row[8],
        'description': strip_emoji(row[9]),
        'tags': tags,
        'photos': photos,
        'audioTrack': audio_track,
        'isCommunity': True,
        'createdAt': row[13],
        'audioRecipe': {
            'style': 'regional_acoustic',
            'bpm': 72,
            'scale': '用户专属原声音景',
            'instruments': audio_track.get('title') if audio_track else '用户专属上传音乐',
            'naturalSound': 'wind'
        }
    }


class GeoMelodyHandler(BaseHTTPRequestHandler):
    server_version = 'GeoMelodyCommunity/2.0'

    def log_message(self, message_format, *args):
        # Community sync is routine background traffic. Logging every successful
        # poll caused unnecessary disk growth on the production server.
        path = urlparse(self.path).path
        if self.command == 'GET' and path in ('/api/community/spots', '/api/spots', '/api/health'):
            return
        super().log_message(message_format, *args)

    def _require_allowed_origin(self):
        origin = self.headers.get('Origin', '').strip()
        if origin and origin not in ALLOWED_ORIGINS and '*' not in ALLOWED_ORIGINS:
            raise RequestError('不允许从当前网站提交内容', 403, 'ORIGIN_NOT_ALLOWED')

    def _send_cors_headers(self):
        origin = self.headers.get('Origin', '')
        if origin and (origin in ALLOWED_ORIGINS or '*' in ALLOWED_ORIGINS):
            self.send_header('Access-Control-Allow-Origin', '*' if '*' in ALLOWED_ORIGINS else origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _send_json(self, data, status=200, cache_control='no-store'):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', cache_control)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self._send_cors_headers()
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _send_error_json(self, error):
        if isinstance(error, RequestError):
            self._send_json({
                'success': False,
                'error': str(error),
                'code': error.code
            }, error.status)
            return

        is_disk_full = isinstance(error, OSError) and getattr(error, 'errno', None) == 28
        is_db_full = isinstance(error, sqlite3.OperationalError) and 'full' in str(error).lower()
        if is_disk_full or is_db_full:
            self._send_json({
                'success': False,
                'error': '服务器存储空间不足，请稍后重试。',
                'code': 'STORAGE_FULL'
            }, 507)
            return

        traceback.print_exc()
        self._send_json({
            'success': False,
            'error': '服务器处理请求失败，请稍后重试。',
            'code': 'INTERNAL_ERROR'
        }, 500)

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)
        try:
            if path in ('/api/community/spots', '/api/spots'):
                self._get_spots()
            elif path in ('/api/community/comments', '/api/comments'):
                self._get_comments(params)
            elif path == '/api/locate':
                self._get_location()
            elif path == '/api/health':
                self._get_health()
            elif path.startswith('/uploads/'):
                self._serve_upload(path)
            else:
                self._send_json({'success': False, 'error': 'Not found'}, 404)
        except Exception as error:
            self._send_error_json(error)

    def _get_spots(self):
        params = parse_qs(urlparse(self.path).query)
        cursor = params.get('cursor', [''])[0]
        if cursor and (not cursor.isdigit() or len(cursor) > 18):
            raise RequestError('无效的分页参数', 400, 'INVALID_CURSOR')
        with get_connection() as connection:
            rows = connection.execute('''
                SELECT id, name, en_name, author, location, country, category,
                       lat, lng, description, tags, photos, audio_track, created_at, rowid
                FROM spots WHERE rowid < ? ORDER BY rowid DESC LIMIT 201
            ''', (int(cursor) if cursor else 9223372036854775807,)).fetchall()
        page = rows[:200]
        self._send_json({'success': True, 'spots': [spot_from_row(row) for row in page],
                         'nextCursor': str(page[-1][14]) if len(rows) > 200 else None})

    def _get_comments(self, params):
        spot_id = clean_text(params.get('spotId', [''])[0], 100)
        if not spot_id:
            raise RequestError('Missing spotId', 400, 'MISSING_SPOT_ID')
        with get_connection() as connection:
            rows = connection.execute('''
                SELECT id, spot_id, author, en_author, text, en_text, likes,
                       reply_to_id, created_at
                FROM comments WHERE spot_id = ? ORDER BY created_at DESC
            ''', (spot_id,)).fetchall()
        comments = [{
            'id': row[0], 'spotId': row[1], 'author': row[2],
            'enAuthor': row[3] or row[2], 'text': row[4],
            'enText': row[5] or row[4], 'likes': row[6] or 0,
            'replyToId': row[7], 'createdAt': row[8]
        } for row in rows]
        self._send_json({'success': True, 'comments': comments})

    def _get_location(self):
        forwarded = self.headers.get('X-Forwarded-For', '')
        client_ip = forwarded.split(',')[0].strip() if forwarded else self.client_address[0]
        self._send_json({
            'success': True,
            'ip': client_ip,
            'lat': 30.2428,
            'lng': 120.1504,
            'city': '杭州',
            'country': '中国',
            'accuracy': 8000,
            'source': 'server-fallback'
        })

    def _get_health(self):
        free_bytes = shutil.disk_usage(BASE_DIR).free
        self._send_json({
            'status': 'ok' if free_bytes >= MAX_REQUEST_BYTES else 'degraded',
            'timestamp': int(time.time()),
            'storageFreeBytes': free_bytes,
            'database': 'ok' if os.path.exists(DB_PATH) else 'initializing'
        })

    def _serve_upload(self, request_path):
        relative = unquote(request_path[len('/uploads/'):])
        candidate = os.path.realpath(os.path.join(UPLOADS_DIR, relative))
        uploads_root = os.path.realpath(UPLOADS_DIR)
        if os.path.commonpath((candidate, uploads_root)) != uploads_root or not os.path.isfile(candidate):
            raise RequestError('Media not found', 404, 'MEDIA_NOT_FOUND')

        file_size = os.path.getsize(candidate)
        start, end = 0, max(0, file_size - 1)
        status = 200
        range_header = self.headers.get('Range', '')
        if range_header.startswith('bytes='):
            try:
                range_value = range_header[6:].split(',', 1)[0]
                start_value, end_value = range_value.split('-', 1)
                start = int(start_value) if start_value else 0
                end = int(end_value) if end_value else end
                end = min(end, file_size - 1)
                if start < 0 or start > end:
                    raise ValueError
                status = 206
            except ValueError:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{file_size}')
                self.end_headers()
                return

        content_length = end - start + 1
        content_type = mimetypes.guess_type(candidate)[0] or 'application/octet-stream'
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(content_length))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'public, max-age=2592000, immutable')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if status == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
        self.end_headers()

        with open(candidate, 'rb') as media_file:
            media_file.seek(start)
            remaining = content_length
            while remaining > 0:
                chunk = media_file.read(min(CHUNK_SIZE, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    break
                remaining -= len(chunk)

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            self._require_allowed_origin()
            if parsed.path in ('/api/community/publish', '/api/publish'):
                self._publish_spot()
            elif parsed.path in ('/api/community/comments', '/api/comments'):
                self._publish_comment()
            else:
                self._send_json({'success': False, 'error': 'Not found'}, 404)
        except Exception as error:
            self._send_error_json(error)

    def _publish_spot(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
        except ValueError:
            raise RequestError('Invalid Content-Length', 400, 'INVALID_CONTENT_LENGTH')
        if content_length <= 0:
            raise RequestError('请求内容为空', 400, 'EMPTY_REQUEST')
        if content_length > MAX_REQUEST_BYTES:
            raise RequestError('上传内容不能超过 60MB', 413, 'REQUEST_TOO_LARGE')

        content_type, _ = cgi.parse_header(self.headers.get('Content-Type', ''))
        title = author = description = category = ''
        lat, lng = 30.2428, 120.1504
        cover_url = audio_url = audio_title = ''
        saved_paths = []

        try:
            if content_type == 'multipart/form-data':
                form = cgi.FieldStorage(
                    fp=self.rfile,
                    headers=self.headers,
                    environ={
                        'REQUEST_METHOD': 'POST',
                        'CONTENT_TYPE': self.headers.get('Content-Type', ''),
                        'CONTENT_LENGTH': str(content_length)
                    },
                    keep_blank_values=True
                )
                title = clean_text(form.getfirst('title'), 42)
                author = clean_text(form.getfirst('author'), 24, '音乐旅人')
                description = clean_text(form.getfirst('description'), 280)
                category = clean_text(form.getfirst('category'), 30, 'town')
                lat = required_coordinate(form.getfirst('currentLat') or form.getfirst('lat'), -90, 90)
                lng = required_coordinate(form.getfirst('currentLng') or form.getfirst('lng'), -180, 180)

                cover_url, cover_path = save_uploaded_file(get_form_item(form, 'cover'), 'cover')
                if cover_path:
                    saved_paths.append(cover_path)
                audio_item = get_form_item(form, 'audio')
                audio_url, audio_path = save_uploaded_file(audio_item, 'audio')
                if audio_path:
                    saved_paths.append(audio_path)
                    audio_title = clean_text(os.path.splitext(os.path.basename(audio_item.filename))[0], 120, title)
            elif content_type == 'application/json':
                body = json.loads(self.rfile.read(content_length).decode('utf-8'))
                title = clean_text(body.get('title'), 42)
                author = clean_text(body.get('author'), 24, '音乐旅人')
                description = clean_text(body.get('description'), 280)
                category = clean_text(body.get('category'), 30, 'town')
                lat = required_coordinate(body.get('lat'), -90, 90)
                lng = required_coordinate(body.get('lng'), -180, 180)
                cover_url = normalize_local_media_url(body.get('coverUrl'), 'cover')
                audio_url = normalize_local_media_url(body.get('audioUrl'), 'audio')
                audio_title = clean_text(body.get('audioTitle'), 120, title)
            else:
                raise RequestError('仅支持 multipart/form-data 或 application/json', 415, 'UNSUPPORTED_CONTENT_TYPE')

            if not title:
                raise RequestError('音景标题不能为空', 400, 'TITLE_REQUIRED')
            if not description:
                raise RequestError('音景描述不能为空', 400, 'DESCRIPTION_REQUIRED')
            if not audio_url or not os.path.isfile(os.path.join(UPLOADS_AUDIO, os.path.basename(audio_url))):
                raise RequestError('请上传音乐文件后再发布', 400, 'AUDIO_REQUIRED')

            spot_id = f'community-{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}'
            location_name = format_location(lat, lng)
            photos = [cover_url] if cover_url else ['/textures/earth_dark.jpg']
            audio_track = None
            if audio_url:
                audio_track = {
                    'id': f'track-{spot_id}',
                    'spotId': spot_id,
                    'title': audio_title or title,
                    'creator': author,
                    'url': audio_url,
                    'license': '用户上传'
                }

            created_at = int(time.time())
            with get_connection() as connection:
                connection.execute('''
                    INSERT INTO spots (
                        id, name, en_name, author, location, country, category,
                        lat, lng, description, tags, photos, audio_track, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    spot_id, title, title, author, location_name, '当前位置', category,
                    lat, lng, description,
                    json.dumps(['用户投稿', 'Community'], ensure_ascii=False),
                    json.dumps(photos, ensure_ascii=False),
                    json.dumps(audio_track, ensure_ascii=False) if audio_track else None,
                    created_at
                ))

            new_spot = {
                'id': spot_id,
                'name': title,
                'enName': title,
                'author': author,
                'location': location_name,
                'country': '当前位置',
                'category': category,
                'lat': lat,
                'lng': lng,
                'description': description,
                'tags': ['用户投稿', 'Community'],
                'photos': photos,
                'audioTrack': audio_track,
                'isCommunity': True,
                'createdAt': created_at,
                'audioRecipe': {
                    'style': 'regional_acoustic',
                    'bpm': 72,
                    'scale': '用户专属原声音景',
                    'instruments': audio_track.get('title') if audio_track else '用户专属上传音乐',
                    'naturalSound': 'wind'
                }
            }
            self._send_json({'success': True, 'spot': new_spot}, 201)
        except Exception:
            for path in saved_paths:
                try:
                    if os.path.exists(path):
                        os.unlink(path)
                except OSError:
                    pass
            raise

    def _publish_comment(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
        except ValueError:
            raise RequestError('Invalid Content-Length', 400, 'INVALID_CONTENT_LENGTH')
        if content_length <= 0 or content_length > 64 * 1024:
            raise RequestError('评论请求大小不正确', 400, 'INVALID_COMMENT_REQUEST')
        body = json.loads(self.rfile.read(content_length).decode('utf-8'))
        spot_id = clean_text(body.get('spotId'), 100)
        author = clean_text(body.get('author'), 24, '音乐旅人')
        text = clean_text(body.get('text'), 200)
        reply_to_id = clean_text(body.get('replyToId'), 100) or None
        if not spot_id or not text:
            raise RequestError('Missing spotId or text', 400, 'MISSING_COMMENT_FIELDS')

        comment_id = f'c-{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}'
        created_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        with get_connection() as connection:
            connection.execute('''
                INSERT INTO comments (
                    id, spot_id, author, en_author, text, en_text,
                    likes, reply_to_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                comment_id, spot_id, author, author, text, text,
                0, reply_to_id, created_at
            ))
        self._send_json({
            'success': True,
            'comment': {
                'id': comment_id,
                'spotId': spot_id,
                'author': author,
                'enAuthor': author,
                'text': text,
                'enText': text,
                'likes': 0,
                'replyToId': reply_to_id,
                'createdAt': created_at,
                'isUser': True,
                'replies': []
            }
        }, 201)


def run(port=8765):
    init_db()
    server = ThreadingHTTPServer((SERVER_HOST, port), GeoMelodyHandler)
    server.daemon_threads = True
    print(f'GeoMelody API Server running on http://{SERVER_HOST}:{port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    selected_port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    run(selected_port)
