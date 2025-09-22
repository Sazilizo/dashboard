import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { iconImports } from "./iconLoader";
import "./tooltip.css"; // Add this line to import custom tooltip styles

export default function RenderIcons({ name, label, ...props }) {
  const [icon, setIcon] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadIcon() {
      if (iconImports[name]) {
        try {
          const mod = await iconImports[name]();
          const iconDef = Object.values(mod)[0];
          if (isMounted) {
            library.add(iconDef);
            setIcon(iconDef);
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

  return (
    <span className="tooltip-wrapper">
      <FontAwesomeIcon icon={icon} {...props} />
      {label && <span className="tooltip-text">{label}</span>}
    </span>
  );
}
