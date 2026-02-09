import { useState, useRef } from 'react'
import { removeBackground, MODELS } from './utils/removeBg'
import './index.css'
import suggestedBg from './assets/suggested_bg.png'

function App() {
  const [selectedModel, setSelectedModel] = useState('u2netp') // u2netp, silueta, rmbg
  const [originalImage, setOriginalImage] = useState(null)
  const [processedImage, setProcessedImage] = useState(null)
  const [customBackground, setCustomBackground] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [progressMsg, setProgressMsg] = useState('')
  const [error, setError] = useState(null)

  const fileInputRef = useRef(null)
  const bgInputRef = useRef(null)

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (file) {
      setOriginalImage(file)
      setProcessedImage(null)
      setError(null)
      processImage(file, selectedModel)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  // Handle model change
  const handleModelChange = (model) => {
    if (selectedModel !== model) {
      setSelectedModel(model)
      if (originalImage) {
        processImage(originalImage, model)
      }
    }
  }

  // Process image via direct ONNX Runtime
  const processImage = async (file, model) => {
    setIsLoading(true)
    setError(null)
    setProgressMsg('Initializing...')
    try {
      const result = await removeBackground(file, model, (msg) => {
        setProgressMsg(msg);
      })

      // result is now the Data URL string returned from removeBg.js
      if (result) {
        setProcessedImage(result);
      }
    } catch (err) {
      console.error(err)
      setError(`Error: ${err.message || 'Processing failed'}. Check console for details.`)
    } finally {
      setIsLoading(false)
      setProgressMsg('')
    }
  }

  // Handle custom background upload
  const handleBgUpload = (event) => {
    const file = event.target.files[0]
    if (file) {
      const url = URL.createObjectURL(file)
      setCustomBackground(url)
    }
    if (bgInputRef.current) {
      bgInputRef.current.value = '';
    }
  }

  // Download composited result
  const handleDownload = () => {
    if (!processedImage) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const loadImage = (src) => new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.src = src;
    });

    const sources = customBackground
      ? [loadImage(customBackground), loadImage(processedImage)]
      : [loadImage(processedImage)];

    Promise.all(sources).then((images) => {
      const fg = customBackground ? images[1] : images[0];
      const bg = customBackground ? images[0] : null;

      canvas.width = fg.width;
      canvas.height = fg.height;

      // If background exists, draw it first
      if (bg) {
        ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
      } else {
        // For JPG download without background, fill white
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(fg, 0, 0);

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/jpeg', 0.9);
      a.download = 'obr_result.jpg';
      a.click();
    });
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-8 font-sans bg-gray-50 text-gray-800 w-full">
      <header className="w-full max-w-4xl flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold tracking-tighter border-b-4 border-black pb-1">Obr background remover</h1>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-4 gap-8">

        {/* Sidebar: Controls */}
        <div className="md:col-span-1 flex flex-col gap-6">
          <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="font-bold text-lg mb-4 uppercase">Select Model</h2>
            <div className="flex flex-col gap-3">
              {[
                { id: 'u2netp', label: MODELS.u2netp.name },
                { id: 'silueta', label: MODELS.silueta.name },
                { id: 'rmbg_quant', label: MODELS.rmbg_quant.name },
                { id: 'rmbg_fp16', label: MODELS.rmbg_fp16.name },
                { id: 'rmbg_full', label: MODELS.rmbg_full.name },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleModelChange(m.id)}
                  className={`w-full py-2 px-3 text-left border-2 font-medium transition-all
                    ${selectedModel === m.id
                      ? 'bg-yellow-300 border-black translate-x-1 translate-y-1 shadow-none'
                      : 'bg-white border-black hover:bg-gray-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-4 text-[10px] text-gray-500 italic">
              *Models are fetched from Hugging Face and cached locally.
            </p>
          </div>

          <div className="bg-white border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <h2 className="font-bold text-lg mb-4 uppercase">Background</h2>
            <button
              onClick={() => bgInputRef.current.click()}
              className="w-full bg-blue-500 text-white font-bold py-2 px-4 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
            >
              Upload Background
            </button>
            <input
              type="file"
              ref={bgInputRef}
              onChange={handleBgUpload}
              className="hidden"
              accept="image/*"
            />

            {/* Suggested Background */}
            <div className="mt-4">
              <p className="text-xs font-bold mb-2">Suggested Background:</p>
              <img
                src={suggestedBg}
                alt="Suggested"
                className="w-full h-16 object-contain border-2 border-black cursor-pointer hover:opacity-80 bg-gray-200"
                onClick={() => setCustomBackground(suggestedBg)}
              />
            </div>

            {customBackground && (
              <div className="mt-4 relative group">
                <img src={customBackground} alt="Custom BG" className="w-full h-24 object-cover border-2 border-black" />
                <button
                  onClick={() => setCustomBackground(null)}
                  className="absolute top-1 right-1 bg-red-500 text-white text-xs px-2 py-1 border border-black"
                >
                  X
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main Area: Upload & Preview */}
        <div className="md:col-span-3 flex flex-col gap-6">

          {/* Upload Zone */}
          <div
            className={`border-4 border-dashed border-gray-400 rounded-lg p-12 text-center cursor-pointer transition-colors hover:bg-gray-100 hover:border-black
                  ${originalImage ? 'hidden' : 'block'}
                `}
            onClick={() => fileInputRef.current.click()}
          >
            <div className="text-4xl mb-4">📂</div>
            <h3 className="text-xl font-bold mb-2">Click or Drop Image Here</h3>
            <p className="text-gray-500">Supports JPG, PNG, WEBP, HEIC</p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept="image/*, .heic, .heif"
            />
          </div>

          {/* Preview Section */}
          {originalImage && (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Result</h2>
                <button
                  onClick={() => {
                    setOriginalImage(null);
                    setProcessedImage(null);
                    setCustomBackground(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-sm underline font-bold"
                >
                  Start Over
                </button>
              </div>

              <div className="relative w-full min-h-[400px] border-4 border-black bg-[url('https://bgremovefree.com/img/transparent.jpg')] bg-repeat bg-gray-200 flex items-center justify-center overflow-hidden">
                {/* Background Layer */}
                {customBackground && (
                  <img
                    src={customBackground}
                    alt="Background"
                    className="absolute inset-0 w-full h-full object-cover z-0"
                  />
                )}

                {/* Foreground Layer (Processed Image) */}
                {processedImage ? (
                  <img
                    src={processedImage}
                    alt="Processed"
                    className="relative z-10 max-h-[600px] object-contain"
                  />
                ) : isLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-20">
                    <div className="animate-spin h-10 w-10 border-4 border-black border-t-transparent rounded-full"></div>
                    <div className="ml-4 flex flex-col">
                      <span className="font-bold tracking-tight">Processing...</span>
                      <span className="text-[10px] text-gray-600 font-mono">{progressMsg}</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={handleDownload}
                  disabled={!processedImage}
                  className={`px-8 py-3 font-bold text-lg border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all
                                ${!processedImage
                      ? 'bg-gray-300 cursor-not-allowed'
                      : 'bg-green-400 hover:bg-green-500 active:shadow-none active:translate-x-1 active:translate-y-1'
                    }
                            `}
                >
                  DOWNLOAD RESULT
                </button>
              </div>
              {error && <div className="text-red-600 font-bold border-2 border-red-600 p-2 bg-red-50">{error}</div>}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

export default App
