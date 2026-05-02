import { createRoot } from "react-dom/client";
import { useGLTF } from "@react-three/drei";
import App from "./App.tsx";
import "./index.css";

// Enable Draco decoder for compressed GLB files (global, one-time setup)
useGLTF.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");

createRoot(document.getElementById("root")!).render(<App />);
