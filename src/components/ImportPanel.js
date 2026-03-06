import React, { useState } from "react";
import { runPhotoImport } from "../features/wardrobe/photoImport.js";
import { useWardrobeStore } from "../stores/wardrobeStore.js";

export default function ImportPanel() {
  const [busy, setBusy] = useState(false);
  const addGarment = useWardrobeStore(s => s.addGarment);

  return React.createElement("div", {
    style: {
      padding: 16, borderRadius: 16,
      background: "#171a21", border: "1px solid #2b3140"
    }
  },
    React.createElement("h3", { style: { marginTop: 0 } }, "Import Garments"),
    React.createElement("input", {
      type: "file",
      multiple: true,
      accept: "image/*",
      disabled: busy,
      onChange: async e => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setBusy(true);
        for (const file of files) {
          const garment = await runPhotoImport(file);
          addGarment(garment);
        }
        setBusy(false);
        e.target.value = "";
      }
    }),
    React.createElement("div", { style: { opacity: 0.7, fontSize: 13, marginTop: 10 } },
      busy ? "Importing..." : "Upload garment photos. Imports create thumbnails and hashes without freezing startup."
    )
  );
}
