from flask import Flask, Response
import requests

app = Flask(__name__)

ESP32_CAM_STREAM_URL = "http://192.168.159.68/stream"  # Change l'IP ici si besoin

@app.route("/")
def index():
    return "<h1>Caméra proxy OK</h1>"

@app.route("/cam")
def cam_proxy():
    r = requests.get(ESP32_CAM_STREAM_URL, stream=True)
    return Response(r.iter_content(1024), content_type='multipart/x-mixed-replace; boundary=frame')

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
