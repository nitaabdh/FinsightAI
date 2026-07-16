import { useTheme } from "../context/ThemeContext";
import "./ThemeToggle.css";

import { Moon, Sun } from "lucide-react";
export default function ThemeToggle({ accent = "personal" }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      className={"theme-toggle theme-toggle--" + accent}
      onClick={toggleTheme}
      title={isDark ? "Ganti ke Light Mode" : "Ganti ke Dark Mode"}
    >
      <div className={"theme-toggle__track " + (isDark ? "" : "theme-toggle__track--light")}>
        <span className="theme-toggle__icon theme-toggle__icon--dark"><Moon size={15} /></span>
        <span className="theme-toggle__icon theme-toggle__icon--light"><Sun size={15} /></span>
        <div className={"theme-toggle__thumb " + (isDark ? "" : "theme-toggle__thumb--light")} />
      </div>
      <span className="theme-toggle__label">
        {isDark ? "Dark Mode" : "Light Mode"}
      </span>
    </button>
  );
}
