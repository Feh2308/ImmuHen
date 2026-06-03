import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchRequestsApi,
  uploadTemperaturePhotoApi,
} from "../services/vacitechApi";

function formatRequestLabel(request) {
  if (!request) {
    return "Selecione uma solicitacao";
  }

  const vaccinator = request.vaccinatorName || request.vaccinator || "Vacinador";
  const startDate = request.vaccinationStartDate || request.date || "-";
  const endDate = request.vaccinationEndDate || request.date || "-";

  return `${vaccinator} - ${startDate} ate ${endDate}`;
}

function TemperatureCapture() {
  const [searchParams] = useSearchParams();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const requestIdFromUrl = searchParams.get("requestId") || "";
  const [requests, setRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState(requestIdFromUrl);
  const [photo, setPhoto] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [photoCapturedAt, setPhotoCapturedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    async function loadRequests() {
      try {
        const data = await fetchRequestsApi();
        setRequests(data);
        if (!selectedRequestId && data[0]?.id) {
          setSelectedRequestId(String(data[0].id));
        }
      } catch (error) {
        console.log(error);
      }
    }

    loadRequests();
  }, []);

  useEffect(() => {
    return () => {
      stopCamera(false);
    };
  }, []);

  const selectedRequest = useMemo(() => {
    return requests.find((request) => String(request.id) === String(selectedRequestId));
  }, [requests, selectedRequestId]);

  function stopCamera(updateState = true) {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (updateState) {
      setCameraActive(false);
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Este aparelho ou navegador nao liberou acesso direto a camera.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
        },
      });

      streamRef.current = stream;
      setCameraActive(true);

      window.requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (error) {
      setMessage("Nao foi possivel abrir a camera. Verifique a permissao do navegador.");
    } finally {
      setLoading(false);
    }
  }

  function capturePhoto() {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      setMessage("A camera ainda nao carregou a imagem. Tente novamente em alguns segundos.");
      return;
    }

    const maxSize = 1600;
    const scale = Math.min(1, maxSize / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));

    const context = canvas.getContext("2d");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const capturedAt = new Date().toISOString();
    setPhoto(canvas.toDataURL("image/jpeg", 0.82));
    setPhotoName(`temperatura-vacina-${Date.now()}.jpg`);
    setPhotoCapturedAt(capturedAt);
    setMessage("");
    stopCamera();
  }

  async function submitPhoto(event) {
    event.preventDefault();

    if (!selectedRequestId) {
      setMessage("Selecione uma solicitacao.");
      return;
    }

    if (!photo) {
      setMessage("Tire a foto da temperatura pela camera.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await uploadTemperaturePhotoApi(selectedRequestId, {
        temperaturePhoto: photo,
        temperaturePhotoName: photoName || "temperatura-vacina.jpg",
        temperatureNotes: notes,
        temperaturePhotoSource: "GRANJA",
        temperaturePhotoBy: "Granja",
        temperaturePhotoCaptureMode: "CAMERA_LIVE",
        temperaturePhotoCapturedAt: photoCapturedAt,
      });
      setMessage("Foto enviada para o ImmuHen.");
      setPhoto("");
      setPhotoName("");
      setPhotoCapturedAt("");
      setNotes("");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-white p-4">
      <section className="mx-auto max-w-xl rounded-3xl border border-green-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-wide text-green-700">
          ImmuHen
        </p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-900">
          Foto da temperatura
        </h1>
        <p className="mt-2 text-zinc-500">
          Tire a foto no celular e envie direto para a solicitacao de vacinacao.
        </p>

        <form onSubmit={submitPhoto} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            Solicitacao
            <select
              value={selectedRequestId}
              onChange={(event) => setSelectedRequestId(event.target.value)}
              className="rounded-2xl border border-green-100 bg-green-50 p-4 text-zinc-900 outline-none"
            >
              {requestIdFromUrl && !selectedRequest && (
                <option value={requestIdFromUrl}>
                  Solicitacao {requestIdFromUrl}
                </option>
              )}
              {!requestIdFromUrl && (
                <option value="">
                  Selecione uma solicitacao
                </option>
              )}
              {requests.map((request) => (
                <option key={request.id} value={request.id}>
                  {formatRequestLabel(request)}
                </option>
              ))}
            </select>
          </label>

          {selectedRequest && (
            <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-sm text-zinc-700">
              <p className="font-bold text-zinc-900">
                {selectedRequest.vaccinatorName || "Vacinador"}
              </p>
              <p>
                Status: {selectedRequest.status || "PENDENTE"}
              </p>
              <p>
                Granja: {selectedRequest.farmName || "Nao informada"}
              </p>
            </div>
          )}

          <div className="grid gap-3 rounded-2xl border border-green-100 bg-green-50 p-4">
            <p className="text-sm font-bold text-zinc-700">
              Foto tirada na hora
            </p>

            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`max-h-96 rounded-2xl border border-green-100 bg-zinc-950 object-contain ${cameraActive ? "block" : "hidden"}`}
            />

            <div className="flex flex-wrap gap-3">
              {!cameraActive && (
                <button
                  type="button"
                  onClick={startCamera}
                  disabled={loading}
                  className="rounded-2xl bg-zinc-900 px-5 py-3 font-bold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Abrir camera
                </button>
              )}

              {cameraActive && (
                <>
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="rounded-2xl bg-green-600 px-5 py-3 font-bold text-white transition hover:bg-green-700"
                  >
                    Tirar foto agora
                  </button>
                  <button
                    type="button"
                    onClick={() => stopCamera()}
                    className="rounded-2xl border border-green-200 bg-white px-5 py-3 font-bold text-green-700 transition hover:bg-green-100"
                  >
                    Fechar camera
                  </button>
                </>
              )}
            </div>
          </div>

          {photo && (
            <div className="grid gap-2">
              <img
                src={photo}
                alt="Previa da temperatura"
                className="max-h-96 rounded-2xl border border-green-100 object-contain"
              />
              <p className="text-sm font-semibold text-green-700">
                Capturada agora: {new Date(photoCapturedAt).toLocaleString("pt-BR")}
              </p>
            </div>
          )}

          <label className="grid gap-2 text-sm font-bold text-zinc-700">
            Observacao
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ex.: temperatura registrada, horario, responsavel."
              className="min-h-28 rounded-2xl border border-green-100 bg-green-50 p-4 text-zinc-900 outline-none"
            />
          </label>

          {message && (
            <p className="rounded-2xl border border-green-100 bg-green-50 p-4 font-bold text-green-700">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-green-600 px-6 py-4 font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Enviando..." : "Enviar foto"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default TemperatureCapture;
