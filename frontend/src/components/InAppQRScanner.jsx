import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, RefreshCw, AlertCircle } from 'lucide-react';

const InAppQRScanner = ({ isOpen, onClose, onScanSuccess }) => {
  const [cameraError, setCameraError] = useState('');
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    let html5QrCode = null;
    let isMounted = true;

    const startScanner = async () => {
      setCameraError('');
      setScanning(true);

      // Check if getUserMedia is supported in this context
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (isMounted) {
          setCameraError('Live QR scanning needs a secure HTTPS address. Open the customer app using its HTTPS website, then allow camera access.');
          setScanning(false);
        }
        return;
      }

      try {
        html5QrCode = new Html5Qrcode('in-app-qr-reader');
        scannerRef.current = html5QrCode;

        // Try getting list of video devices
        let cameraConfig = { facingMode: 'environment' };
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            const backCam = devices.find((d) =>
              /back|rear|environment/i.test(d.label)
            );
            cameraConfig = backCam ? backCam.id : devices[devices.length - 1].id;
          }
        } catch {
          // Fallback to facingMode
        }

        await html5QrCode.start(
          cameraConfig,
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const qrboxSize = Math.floor(minEdge * 0.75);
              return { width: qrboxSize, height: qrboxSize };
            },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (isMounted) {
              if (navigator.vibrate) {
                try {
                  navigator.vibrate([40, 60, 40]);
                } catch { /* Ignore vibration failures; scanning can continue. */ }
              }
              html5QrCode
                .stop()
                .then(() => {
                  onScanSuccess(decodedText);
                  onClose();
                })
                .catch(() => {
                  onScanSuccess(decodedText);
                  onClose();
                });
            }
          },
          () => {}
        );
      } catch (err) {
        if (isMounted) {
          console.error('Camera startup error:', err);
          const isNotAllowed =
            err?.name === 'NotAllowedError' ||
            String(err).includes('NotAllowedError') ||
            String(err).includes('Permission denied');
          setCameraError(
            isNotAllowed
              ? 'Camera permission is blocked. Allow camera access for this website in your browser settings, then reopen the scanner.'
              : 'The camera could not start. Make sure this page uses HTTPS and allow camera access, then try again.'
          );
          setScanning(false);
        }
      }
    };

    const timer = setTimeout(startScanner, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        try {
          scannerRef.current
            .stop()
            .catch(() => {})
            .finally(() => {
              try {
                scannerRef.current.clear();
              } catch { /* The scanner may already be stopped during cleanup. */ }
            });
        } catch { /* Camera may already be stopped or unavailable. */ }
      }
    };
  }, [isOpen, onClose, onScanSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#18181B] border border-[#27272A] w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl flex flex-col relative text-white">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#27272A] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#E85D2A]/20 text-[#E85D2A] flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">Table QR Scanner</h3>
              <p className="text-[11px] text-[#A1A1AA]">Switch tables or reconnect session</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col items-center justify-center bg-black/40">
            <div
              id="in-app-qr-reader"
              className={`w-full max-w-[270px] h-[270px] rounded-2xl overflow-hidden bg-black flex items-center justify-center shadow-inner ${cameraError ? 'border-2 border-dashed border-amber-500/50' : 'border-2 border-[#E85D2A]/60'}`}
            />

            {cameraError && (
              <div className="mt-3 p-3 bg-amber-950/40 border border-amber-800/60 rounded-2xl text-amber-200 text-xs flex flex-col gap-2 text-left w-full">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <span className="leading-snug text-[11px]">{cameraError}</span>
                </div>
              </div>
            )}

            {!cameraError && scanning && (
              <p className="text-[11px] text-zinc-400 mt-3 flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin text-[#E85D2A]" />
                Align table QR within the frame...
              </p>
            )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#121215] border-t border-[#27272A] flex justify-between items-center text-xs text-zinc-400">
          <span>Seamless table sync</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default InAppQRScanner;
