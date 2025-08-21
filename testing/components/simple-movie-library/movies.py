import os
import json
from http.server import SimpleHTTPRequestHandler, HTTPServer

class MovieHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/movies':
            movies_folder = 'movies'
            movies = []

            for filename in os.listdir(movies_folder):
                if filename.endswith('.mp4') or filename.endswith('.mkv'):
                    thumbnail_path = os.path.join(movies_folder, filename.rsplit('.', 1)[0] + '.jpg')
                    if not os.path.exists(thumbnail_path):
                        thumbnail_path = 'black-thumbnail.jpg'
                    movie = {
                        'name': filename,
                        'thumbnail': thumbnail_path
                    }
                    movies.append(movie)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(movies).encode())
        else:
            super().do_GET()

if __name__ == '__main__':
    server_address = ('', 8000)
    httpd = HTTPServer(server_address, MovieHandler)
    print('Running server on port 8000...')
    httpd.serve_forever()