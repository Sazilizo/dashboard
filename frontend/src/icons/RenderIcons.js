import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { iconImports } from "./iconLoader";

export default function RenderIcons({ name, ...props }) {
  const [icon, setIcon] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadIcon() {
      if (iconImports[name]) {
        try {
          const mod = await iconImports[name]();
          // Grab the first export (e.g., faPhone)
          const iconDef = Object.values(mod)[0];
          if (isMounted) {
            library.add(iconDef); // register in FA library
            setIcon(iconDef); // set for direct usage
          }
        } catch (err) {
          console.error(`Failed to load icon ${name}:`, err);
        }
      }
    }

    loadIcon();
    return () => {
      isMounted = false;
    };
  }, [name]);

  if (!icon) return <span style={{ width: "1em", display: "inline-block" }} />;

  return <FontAwesomeIcon icon={icon} {...props} />;
}
