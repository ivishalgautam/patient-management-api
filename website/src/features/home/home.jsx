"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SiteHeader } from "./site-header";
import { Hero } from "./hero";
import { ToothChart } from "./tooth-chart";
import { Modules } from "./modules";
import { Day } from "./day";
import { Apps } from "./apps";
import { Trust } from "./trust";
import { Faq } from "./faq";
import { SiteFooter } from "./site-footer";

// The home page and all its motion. Motion is quiet: things settle into
// place, nothing bounces. Reduced-motion users get the finished page.
export function Home() {
  const root = useRef(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const q = gsap.utils.selector(root);
      const ease = "power3.out";

      // Hero: the copy rises line by line, the board slides up after it.
      gsap.from(q(".hm-hero-in"), { y: 28, opacity: 0, duration: 0.9, stagger: 0.08, ease });
      gsap.from(q(".hm-hero-board"), { y: 48, opacity: 0, duration: 1.1, delay: 0.25, ease });
      q(".hm-float").forEach((card, i) => {
        gsap.from(card, { y: 20, opacity: 0, duration: 0.8, delay: 0.9 + i * 0.2, ease });
        gsap.to(card, { y: i ? 6 : -6, duration: 3 + i, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 1.8 });
      });

      // Section headings.
      q(".hm-head").forEach((head) => {
        gsap.from(head.querySelectorAll(".hm-rise"), {
          y: 30,
          opacity: 0,
          duration: 0.9,
          stagger: 0.08,
          ease,
          scrollTrigger: { trigger: head, start: "top 85%" },
        });
      });
      q(".hm-reveal").forEach((el) => {
        gsap.from(el, { y: 24, opacity: 0, duration: 0.8, ease, scrollTrigger: { trigger: el, start: "top 90%" } });
      });

      // The chart: teeth erupt around the arches, from the molars inwards.
      const teeth = q(".hm-tooth-body");
      gsap.from(teeth, {
        scale: 0,
        transformOrigin: "50% 50%",
        duration: 0.5,
        ease: "back.out(2)",
        stagger: { each: 0.025, from: "edges" },
        scrollTrigger: { trigger: q(".hm-chart")[0], start: "top 70%" },
      });

      // Feature cards settle in, one row at a time.
      ScrollTrigger.batch(q(".hm-card"), {
        start: "top 88%",
        once: true,
        onEnter: (batch) => gsap.from(batch, { y: 40, opacity: 0, duration: 0.9, stagger: 0.1, ease }),
      });

      // The phones drift apart a little as they come into view.
      gsap.from(q(".hm-phone"), {
        y: 60,
        opacity: 0,
        rotate: 0,
        duration: 1.1,
        stagger: 0.15,
        ease,
        scrollTrigger: { trigger: q("#apps")[0], start: "top 65%" },
      });
    });

    // A day at the clinic: pinned and scrolled sideways on large screens.
    mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
      const q = gsap.utils.selector(root);
      const track = q(".hm-day-track")[0];
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: q(".hm-day")[0],
          pin: q(".hm-day-pin")[0],
          start: "top top",
          end: () => `+=${distance()}`,
          scrub: 0.8,
          invalidateOnRefresh: true,
        },
      });
      tl.to(track, { x: () => -distance(), ease: "none" }, 0).fromTo(
        q(".hm-day-progress"),
        { scaleX: 0 },
        { scaleX: 1, ease: "none" },
        0,
      );
    });

    return () => mm.revert();
  }, []);

  return (
    <div ref={root} className="overflow-x-clip">
      <SiteHeader />
      <main>
        <Hero />
        <ToothChart />
        <Modules />
        <Day />
        <Apps />
        <Trust />
        <Faq />
      </main>
      <SiteFooter />
    </div>
  );
}
