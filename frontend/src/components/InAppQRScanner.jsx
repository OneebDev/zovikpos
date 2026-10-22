import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, RefreshCw, AlertCircle } from 'lucide-react';
import ModalShell from './ui/ModalShell';

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
    <ModalShell isOpen onClose={onClose} labelledBy="customer-qr-title" closeOnBackdrop={false} closeOnEscape={false} className="customer-modal customer-modal--scanner">
        {/* Header */}
        <div className="customer-modal__header">
          <div className="flex items-center gap-2.5">
            <div className="customer-modal__icon">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 id="customer-qr-title">Table QR Scanner</h2>
              <p>Switch tables or reconnect session</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="customer-modal__close icon-btn"
            aria-label="Close QR scanner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="customer-modal__body customer-modal__scanner-body">
          <p className="customer-modal__scanner-help">Align the table QR within the frame</p>
          <div className="customer-modal__scanner-frame">
            <div
              id="in-app-qr-reader"
              className={`customer-modal__scanner-viewport${cameraError ? ' has-error' : ''}`}
            />
          </div>

            {cameraError && (
              <div className="customer-modal__scanner-error">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{cameraError}</span>
                </div>
              </div>
            )}

            {!cameraError && scanning && (
              <p className="customer-modal__scanner-status">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Starting camera…
              </p>
            )}

        </div>

        {/* Footer */}
        <div className="customer-modal__footer">
          <span>Seamless table sync</span>
          <button
            onClick={onClose}
            className="customer-modal__button customer-modal__button--secondary"
          >
            Close
          </button>
        </div>
    </ModalShell>
  );
};

export default InAppQRScanner;
