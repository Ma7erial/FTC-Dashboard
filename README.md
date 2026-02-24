# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/9a592c4c-2166-4e4d-b86a-7bd81ae95b6f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. (Optional) Set `LLAMA_MODEL_PATH` in [.env.local](.env.local) if you want to override the default model location.
3. Run the app:
   `npm run dev`

---

### Switching to a Local Llama Model

The app originally used Google Gemini from the browser; the code has been
rewritten to run the language model server‑side using `node-llama-cpp`.  The server also supports streaming responses for faster UI interactivity.
* Place a GGUF model file under `models/model.gguf` or set
  `LLAMA_MODEL_PATH` to the location of your model.
* After installing dependencies (`npm install`) the server will lazily load
  the model the first time an AI endpoint is called.  **Note:** large models
  may be slow to initialize and may require disabling GPU support or setting
  `gpuLayers: 0` (the server already forces CPU by default to avoid Vulkan
  allocation errors on systems without sufficient GPU memory).
* New endpoints are available under `/api/ai/*` (and the same routes accept
  a `?stream=true` query parameter to produce a chunked text stream). The
  React client still uses the exported helpers (`fetchFTCNews`,
  `getAttendanceInsights`, etc.), but streaming variants (`streamFTCNews`,
  `streamAttendanceInsights`, etc.) are also provided for progressive
  rendering.

