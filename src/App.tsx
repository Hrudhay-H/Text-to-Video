import { useState } from 'react';
import { Film, Download, Loader2, Video, Sparkles, Settings2, Info } from 'lucide-react';

// Define the shape of our model configuration
interface ModelConfig {
  id: string;
  name: string;
  description: string;
  version?: string;
  endpoint: string;
  // payloadBuilder now takes advanced options
  payloadBuilder: (
    prompt: string,
    options: { version?: string; guidanceScale: number; enhancePrompt: boolean }
  ) => any;
  defaultGuidance: number;
}

const MODELS: Record<string, ModelConfig> = {
  'ltx-video': {
    id: 'ltx-video',
    name: 'Lightricks LTX Video',
    description: 'Fast, high-quality video generation',
    version: '8c47da666861d081eeb4d1261853087de23923a268a69b63febdf5dc1dee08e4',
    endpoint: '/api/replicate/predictions',
    defaultGuidance: 3.0,
    payloadBuilder: (prompt, { version, guidanceScale }) => ({
      version,
      input: {
        prompt,
        aspect_ratio: "16:9",
        negative_prompt: "low quality, worst quality, deformed, distorted, watermark",
        guidance_scale: guidanceScale,
        // LTX uses num_inference_steps, we can default or expose it later. 
        // Keeping it simple for now or hardcoding a 'high quality' default if user wants better accuracy.
        // num_inference_steps: 40 
      }
    })
  },
  'wan-2.5': {
    id: 'wan-2.5',
    name: 'Wan 2.5 (Alibaba)',
    description: 'Advanced Chinese/English T2V model',
    endpoint: '/api/replicate/models/wan-video/wan-2.5-t2v/predictions',
    defaultGuidance: 5.0,
    payloadBuilder: (prompt, { guidanceScale, enhancePrompt }) => ({
      input: {
        prompt,
        aspect_ratio: "16:9",
        negative_prompt: "low quality, worst quality, deformed, distorted, watermark",
        guidance_scale: guidanceScale,
        enable_prompt_expansion: enhancePrompt
      }
    })
  }
};

export default function TextToVideoGenerator() {
  const [selectedModelId, setSelectedModelId] = useState<keyof typeof MODELS>('ltx-video');
  const [inputText, setInputText] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  // Advanced Settings State
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [guidanceScale, setGuidanceScale] = useState(MODELS['ltx-video'].defaultGuidance);
  const [enhancePrompt, setEnhancePrompt] = useState(true);

  // Update default guidance when model changes
  const handleModelChange = (modelId: keyof typeof MODELS) => {
    setSelectedModelId(modelId);
    setGuidanceScale(MODELS[modelId].defaultGuidance);
  };

  const handleGenerate = async () => {
    if (!inputText.trim()) {
      setError('Please enter a description for your video');
      return;
    }

    setLoading(true);
    setError('');
    setVideoUrl('');
    setStatus('Starting generation...');

    const modelConfig = MODELS[selectedModelId];

    try {
      const payload = modelConfig.payloadBuilder(inputText, {
        version: modelConfig.version,
        guidanceScale,
        enhancePrompt
      });

      const response = await fetch(modelConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_REPLICATE_API_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to start video generation');
      }

      let prediction = await response.json();
      setStatus(`Generation ${prediction.status}...`);

      while (
        prediction.status !== 'succeeded' &&
        prediction.status !== 'failed' &&
        prediction.status !== 'canceled'
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const pollResponse = await fetch(`/api/replicate/predictions/${prediction.id}`, {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_REPLICATE_API_TOKEN}`,
          },
        });

        if (!pollResponse.ok) {
          const err = await pollResponse.json();
          throw new Error(err.detail || 'Failed to poll status');
        }

        prediction = await pollResponse.json();
        setStatus(`Generation ${prediction.status}...`);
      }

      if (prediction.status === 'succeeded' && prediction.output) {
        const output = prediction.output;
        const url = Array.isArray(output) ? output[0] : output;
        setVideoUrl(url);
      } else {
        throw new Error(`Generation failed with status: ${prediction.status}`);
      }

    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'An error occurred while generating the video');
      } else {
        setError('An unknown error occurred');
      }
      console.error('Error:', err);
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const handleDownload = () => {
    if (videoUrl) {
      const a = document.createElement('a');
      a.href = videoUrl;
      a.download = `generated-${selectedModelId}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-4">
            <Film className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-2">Text to Video</h1>
          <p className="text-gray-400">Transform your words into motion</p>
        </div>

        {/* Model Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Select Model
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.values(MODELS).map((model) => (
              <button
                key={model.id}
                onClick={() => handleModelChange(model.id as keyof typeof MODELS)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${selectedModelId === model.id
                    ? 'border-white bg-gray-900'
                    : 'border-gray-800 bg-gray-950 hover:border-gray-600'
                  }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  {model.id === 'ltx-video' ? <Video className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                  <span className="font-semibold">{model.name}</span>
                </div>
                <p className="text-sm text-gray-400">{model.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Input Section */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Description
          </label>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Describe the video you want ${MODELS[selectedModelId].name} to create...`}
            className="w-full h-40 bg-white text-black p-4 rounded-lg border-2 border-gray-300 focus:border-gray-500 focus:outline-none resize-none placeholder-gray-400 transition-colors"
            disabled={loading}
          />

          {/* Advanced Settings Toggle */}
          <div className="mt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <Settings2 className="w-4 h-4" />
              {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
            </button>

            {showAdvanced && (
              <div className="mt-4 p-4 bg-gray-900 rounded-lg border border-gray-800 space-y-4">
                {/* Guidance Scale */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                      Guidance Scale
                      <div className="group relative">
                        <Info className="w-3 h-3 text-gray-500 cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-xs text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          How closely to follow the prompt
                        </div>
                      </div>
                    </label>
                    <span className="text-sm text-gray-400">{guidanceScale}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={guidanceScale}
                    onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Creative (1)</span>
                    <span>Strict (10)</span>
                  </div>
                </div>

                {/* Prompt Enhancement (Wan only) */}
                {selectedModelId === 'wan-2.5' && (
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                      Enhance Prompt
                      <div className="group relative">
                        <Info className="w-3 h-3 text-gray-500 cursor-help" />
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-xs text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          Automatically rewrite prompt for better details
                        </div>
                      </div>
                    </label>
                    <button
                      onClick={() => setEnhancePrompt(!enhancePrompt)}
                      className={`w-12 h-6 rounded-full transition-colors relative ${enhancePrompt ? 'bg-white' : 'bg-gray-700'
                        }`}
                    >
                      <div
                        className={`absolute top-1 left-1 w-4 h-4 rounded-full transition-transform ${enhancePrompt ? 'bg-black translate-x-6' : 'bg-gray-400 translate-x-0'
                          }`}
                      />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="text-red-500 mt-2 text-sm">{error}</p>
          )}
          {status && (
            <p className="text-blue-400 mt-2 text-sm text-center animate-pulse">{status}</p>
          )}
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full bg-white text-black py-4 rounded-lg font-semibold text-lg hover:bg-gray-200 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating...
            </>
          ) : (
            'Generate Video'
          )}
        </button>

        {/* Video Player Section */}
        {videoUrl && (
          <div className="mt-12 border-2 border-gray-700 rounded-lg overflow-hidden">
            <video
              src={videoUrl}
              controls
              autoPlay
              loop
              className="w-full"
              style={{ maxHeight: '500px' }}
            >
              Your browser does not support the video tag.
            </video>

            {/* Download Button */}
            <div className="bg-gray-900 p-4">
              <button
                onClick={handleDownload}
                className="w-full bg-white text-black py-3 rounded-lg font-semibold hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-5 h-5" />
                Save Video
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && !videoUrl && (
          <div className="mt-8 text-center">
            <div className="inline-block">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
            <p className="text-gray-400 mt-4">This may take a few minutes...</p>
          </div>
        )}
      </div>
    </div>
  );
}
