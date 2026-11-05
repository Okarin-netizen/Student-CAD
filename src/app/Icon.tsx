// SPDX-License-Identifier: MIT
// Copyright (c) 2026 技術科　岡田

// 線でかいたアイコン(デザイン E「モノトーン線画」)。
// 絵文字は端末ごとに絵がちがい、子どもっぽく見えるので、ボタンにはこのアイコンを使う。
// すべて 24×24 のマス目に、文字と同じ色(currentColor)の線でかく。

export type IconName =
  | "sketch"
  | "extrude"
  | "cut"
  | "revolve"
  | "fillet"
  | "chamfer"
  | "mirror"
  | "pattern"
  | "patternCircle"
  | "loft"
  | "sweep"
  | "shell"
  | "more"
  | "export"
  | "drawing"
  | "submit"
  | "undo"
  | "redo"
  | "variables"
  | "folder"
  | "open"
  | "save"
  | "plus"
  | "help"
  | "assignment"
  | "print"
  | "cube"
  | "layers"
  | "check"
  | "alert"
  | "lock"
  | "tap"
  | "info"
  | "select"
  | "line"
  | "rect"
  | "circle"
  | "arc"
  | "polygon"
  | "text"
  | "dimension"
  | "replay"
  | "hourglass"
  | "nameplate"
  | "coaster"
  | "penstand"
  | "keyholder"
  | "blank"
  | "chevron"
  | "back"
  | "play"
  | "pause"
  | "first"
  | "last"
  | "prev"
  | "next";

const PATHS: Record<IconName, string> = {
  sketch: "M3 21h4L19 9l-4-4L3 17z M13 7l4 4",
  extrude: "M4 15l8 4 8-4 M4 15l8-4 8 4 M12 11V3 M9 6l3-3 3 3",
  cut: "M4 6h16v12H4z M9 12a3 3 0 106 0 3 3 0 00-6 0",
  revolve: "M4 12a8 3.5 0 1016 0 8 3.5 0 00-16 0 M12 3v18 M16.5 6.2l2.6 1.9-3.1.9",
  fillet: "M4 4v10a6 6 0 006 6h10 M4 4h4 M20 20v-4",
  chamfer: "M4 4v10l6 6h10 M4 4h4 M20 20v-4",
  mirror: "M12 3v18 M9 6L3 18h6z M15 6l6 12h-6z",
  pattern: "M4 4h5v5H4z M15 4h5v5h-5z M4 15h5v5H4z M15 15h5v5h-5z",
  patternCircle: "M12 3.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3 M12 17.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3 M3.5 12a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0 M17.5 12a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0",
  loft: "M8 4h8 M8 4a4 1.5 0 108 0 M4 20a8 2 0 1016 0 8 2 0 00-16 0 M8 4L4 20 M16 4l4 16",
  sweep: "M4 18c0-8 6-12 16-12 M4 18a2 2 0 104 0 2 2 0 00-4 0",
  shell: "M5 7v11a2 2 0 002 2h10a2 2 0 002-2V7 M8 7v10h8V7 M4 7h4 M16 7h4",
  more: "M3.5 12a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0 M10.5 12a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0 M17.5 12a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0",
  export: "M12 3v12 M7 10l5 5 5-5 M4 19h16",
  drawing: "M4 3h16v18H4z M8 8h8 M8 12h8 M13 17h3",
  submit: "M4 13l8 4 8-4 M4 13V6h16v7 M12 3v8 M9 8l3 3 3-3",
  undo: "M9 14L4 9l5-5 M4 9h10a6 6 0 010 12h-3",
  redo: "M15 14l5-5-5-5 M20 9H10a6 6 0 000 12h3",
  variables: "M4 7h6 M4 12h10 M4 17h6 M15 15l5 5 M20 15l-5 5",
  folder: "M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z",
  open: "M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v1 M3 19l3-8h15l-3 8z",
  save: "M5 3h11l3 3v15H5z M8 3v5h7V3 M8 21v-7h8v7",
  plus: "M12 5v14 M5 12h14",
  help: "M12 21a9 9 0 110-18 9 9 0 010 18 M9.5 9a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4 M12 17h.01",
  assignment: "M9 4h6v3H9z M7 5H5v16h14V5h-2 M8 12l2 2 4-4 M8 17h8",
  print: "M7 9V3h10v6 M7 17H4v-8h16v8h-3 M7 14h10v7H7z",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5",
  layers: "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5",
  check: "M5 12l5 5 9-10",
  alert: "M12 4l9 16H3z M12 10v4 M12 17h.01",
  lock: "M6 11h12v10H6z M9 11V7a3 3 0 016 0v4",
  tap: "M9 11V5a2 2 0 014 0v6 M13 10a2 2 0 014 0v2 M17 11a2 2 0 014 0v3a7 7 0 01-7 7h-1a7 7 0 01-6-3.5L5 14a2 2 0 013-2.5l1 1.5",
  info: "M12 21a9 9 0 110-18 9 9 0 010 18 M12 11v6 M12 7h.01",
  select: "M5 3l14 7-6 2-2 6z",
  line: "M5 19L19 5 M5 19h.01 M19 5h.01",
  rect: "M4 6h16v12H4z",
  circle: "M12 20a8 8 0 110-16 8 8 0 010 16",
  arc: "M4 18a8 8 0 0116 0",
  polygon: "M12 3l8 5v8l-8 5-8-5V8z",
  text: "M5 6V4h14v2 M12 4v16 M9 20h6",
  dimension: "M3 12h18 M6 9l-3 3 3 3 M18 9l3 3-3 3 M3 6v12 M21 6v12",
  replay: "M3 12a9 9 0 103-6.7 M3 4v5h5 M10 9l5 3-5 3z",
  hourglass: "M6 3h12 M6 21h12 M7 3c0 5 10 6 10 9s-10 4-10 9 M17 3c0 5-10 6-10 9s10 4 10 9",
  nameplate: "M3 8h18v8H3z M7 12h6",
  coaster: "M4 12a8 3 0 1016 0 8 3 0 00-16 0 M4 12v2a8 3 0 0016 0v-2",
  penstand: "M6 9h12v11H6z M8 9L7 3 M12 9V2 M16 9l1-5",
  keyholder: "M5 9h11l4 4-4 4H5z M17 13h.01",
  blank: "M6 3h9l3 3v15H6z M15 3v3h3",
  chevron: "M9 6l6 6-6 6",
  back: "M19 12H5 M11 6l-6 6 6 6",
  play: "M7 4l13 8-13 8z",
  pause: "M8 5v14 M16 5v14",
  first: "M6 5v14 M18 5l-9 7 9 7z",
  last: "M18 5v14 M6 5l9 7-9 7z",
  prev: "M15 5l-8 7 8 7z",
  next: "M9 5l8 7-8 7z",
};

interface Props {
  name: IconName;
  /** 大きさ(px)。文字の大きさに合わせるときは "1.25em" など */
  size?: number | string;
  /** 線の太さ */
  stroke?: number;
  className?: string;
}

export function Icon({ name, size = "1.3em", stroke = 1.75, className }: Props) {
  return (
    <svg
      className={`icon ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
