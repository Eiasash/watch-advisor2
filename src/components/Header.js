import React from "react";

export default function Header() {
  return React.createElement("div", {
    style: {
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: 16
    }
  },
    React.createElement("div", null,
      React.createElement("h1", { style: { margin: 0, fontSize: 30 } }, "watch-advisor2"),
      React.createElement("div", { style: { opacity: 0.7, fontSize: 13 } }, "A watch-first outfit planner seeded with your actual collection")
    )
  );
}
