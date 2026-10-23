"use client";
import { useRef } from "react";
import { useTheme } from "next-themes";
import gsap from "gsap";
import { Moon, Sun } from "lucide-react";

// Switches between the paper (light) and chalkboard (dark) themes. Which
// icon shows is decided by the `.dark` class in CSS, so the server render
// never disagrees with the browser; the icon gives a little spin on click.
export function ThemeToggle({ className = "", size = "size-9" }) {
  const { resolvedTheme, setTheme } = useTheme();
  const icon = useRef(null);

  const toggle = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.fromTo(icon.current, { rotate: -120, scale: 0.4 }, { rotate: 0, scale: 1, duration: 0.5, ease: "back.out(2.5)" });
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark theme"
      title="Switch theme"
      className={`relative flex ${size} shrink-0 items-center justify-center rounded-full transition-transform hover:-translate-y-0.5 ${className}`}
    >
      <span ref={icon} className="flex items-center justify-center">
        <Sun className="size-[18px] dark:hidden" />
        <Moon className="hidden size-[18px] dark:block" />
      </span>
    </button>
  );
}
