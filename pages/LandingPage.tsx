import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import LegalFooterLinks from '../components/LegalFooterLinks';
import BrandMark from '../components/BrandMark';

const SECTION_REVEAL_THRESHOLD = 0.15;

const capabilities = [
  {
    title: 'Research intelligence',
    description:
      'Literature discovery, grant matching, and AI recommendations grounded in licensed scientific sources.',
  },
  {
    title: 'Lab operations',
    description:
      'Projects, tasks, experiments, inventory, instruments, and team messaging in one hub.',
  },
  {
    title: 'Scientific records',
    description:
      'Protocols, notebooks, and evidence packs that keep methods and decisions audit-ready.',
  },
  {
    title: 'Analysis & writing',
    description:
      'Statistics, manuscripts, citations, and export — connected to your lab work.',
  },
  {
    title: 'Research network',
    description:
      'Collaboration, ethical data exchange, marketplace directory, events, and peer help.',
  },
  {
    title: 'Research education',
    description:
      'Lab Floors scenarios, AI roleplay, and trainings for people starting in research.',
  },
] as const;

const workflow = [
  {
    step: '01',
    title: 'Capture the idea',
    description:
      'Turn a question into a protocol and experiment plan without losing context.',
  },
  {
    step: '02',
    title: 'Run and record',
    description:
      'Execute work in the lab workspace, notebook, and evidence packs as one chain.',
  },
  {
    step: '03',
    title: 'Analyze and publish',
    description:
      'Move from results to analysis and manuscript with provenance still attached.',
  },
] as const;

function useInView(threshold: number): {
  ref: React.RefObject<HTMLElement | null>;
  visible: boolean;
} {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (node === null) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        const entry = entries[0];
        if (entry?.isIntersecting === true) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [threshold]);

  return { ref, visible };
}

function LandingPage(): React.ReactElement {
  const [heroReady, setHeroReady] = useState(false);
  const { ref: capabilitiesRef, visible: capabilitiesVisible } = useInView(
    SECTION_REVEAL_THRESHOLD
  );
  const { ref: workflowRef, visible: workflowVisible } = useInView(
    SECTION_REVEAL_THRESHOLD
  );

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setHeroReady(true);
    });
    return () => {
      window.cancelAnimationFrame(id);
    };
  }, []);

  return (
    <div className="landing-page min-h-screen bg-[#F7F8F6] text-slate-900 antialiased">
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6 lg:px-8">
          <BrandMark to="/" variant="light" className="text-white" />
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/support"
              className="hidden px-3 py-2 text-sm font-medium text-white/85 transition-colors hover:text-white sm:inline-flex"
            >
              Support us
            </Link>
            <Link
              to="/login"
              className="px-3 py-2 text-sm font-medium text-white/85 transition-colors hover:text-white"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="bg-white px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-100"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <section className="relative min-h-[100svh] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=2400&q=80"
            alt=""
            className={`h-full w-full object-cover ${heroReady ? 'landing-ken' : ''}`}
          />
          <div className="absolute inset-0 bg-slate-950/65" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(15,118,110,0.22),transparent_60%)]" />
        </div>

        <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col items-center justify-center px-6 pb-20 pt-28 text-center lg:px-8 lg:pb-24 lg:pt-24">
          <div className="mx-auto w-full max-w-3xl">
            <p
              className={`landing-serif text-4xl leading-none tracking-tight text-white sm:text-5xl lg:text-6xl ${
                heroReady ? 'landing-rise landing-rise-delay-1' : 'opacity-0'
              }`}
            >
              RILOS
            </p>
            <h1
              className={`mx-auto mt-6 max-w-2xl text-xl font-medium leading-snug text-white/95 sm:text-2xl ${
                heroReady ? 'landing-rise landing-rise-delay-2' : 'opacity-0'
              }`}
            >
              Research Intelligence & Operating System
            </h1>
            <p
              className={`mx-auto mt-4 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg ${
                heroReady ? 'landing-rise landing-rise-delay-3' : 'opacity-0'
              }`}
            >
              Connect scientific discovery, laboratory operations, and researcher wellbeing — without losing context from idea to publication.
            </p>
            <div
              className={`mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row ${
                heroReady ? 'landing-rise landing-rise-delay-4' : 'opacity-0'
              }`}
            >
              <Link
                to="/register"
                className="inline-flex items-center justify-center bg-teal-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-600"
              >
                Start free
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center border border-white/35 px-6 py-3 text-sm font-medium text-white transition-colors hover:border-white/70 hover:bg-white/5"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-200/80 bg-[#F7F8F6]">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
            <h2 className="landing-serif text-3xl leading-tight tracking-tight text-slate-900 sm:text-4xl">
              Built for the full research lifecycle
            </h2>
            <p className="max-w-xl text-lg leading-relaxed text-slate-600">
              RILOS connects what researchers know, what laboratories do, and what science
              produces — so your team spends less time coordinating tools and more time on discovery.
            </p>
          </div>
        </div>
      </section>

      <section
        ref={capabilitiesRef}
        className="border-b border-slate-200/80 bg-white"
      >
        <div
          className={`landing-reveal mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28 ${
            capabilitiesVisible ? 'is-visible' : ''
          }`}
        >
          <div className="mb-14 max-w-2xl">
            <h2 className="landing-serif text-3xl tracking-tight text-slate-900 sm:text-4xl">
              What you can run today
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              The current platform covers daily lab work and the broader research ecosystem.
            </p>
          </div>

          <ul className="divide-y divide-slate-200">
            {capabilities.map((item) => (
              <li
                key={item.title}
                className="grid gap-2 py-8 first:pt-0 last:pb-0 sm:grid-cols-[220px_1fr] sm:gap-10"
              >
                <h3 className="text-base font-semibold tracking-tight text-slate-900">
                  {item.title}
                </h3>
                <p className="text-base leading-relaxed text-slate-600">{item.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section ref={workflowRef} className="bg-[#F7F8F6]">
        <div
          className={`landing-reveal mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-28 ${
            workflowVisible ? 'is-visible' : ''
          }`}
        >
          <div className="mb-14 max-w-2xl">
            <h2 className="landing-serif text-3xl tracking-tight text-slate-900 sm:text-4xl">
              How labs get started
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              A clear path from workspace setup to shared discovery.
            </p>
          </div>

          <ol className="grid gap-12 md:grid-cols-3 md:gap-8">
            {workflow.map((item) => (
              <li key={item.step}>
                <p className="text-xs font-semibold tracking-[0.18em] text-teal-800">
                  {item.step}
                </p>
                <h3 className="landing-serif mt-3 text-2xl tracking-tight text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-slate-600">
                  {item.description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:gap-16">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-teal-800">FREE FOR ALL</p>
              <h2 className="landing-serif mt-3 text-3xl tracking-tight text-slate-900 sm:text-4xl">
                Help keep RILOS running
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
                Early access stays free for researchers and labs. Contributions fund hosting,
                security, AI tools, and ongoing product innovation.
              </p>
            </div>
            <div>
              <Link
                to="/support"
                className="inline-flex items-center justify-center bg-teal-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-600"
              >
                Support us
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-6 py-20 sm:flex-row sm:items-end lg:px-8 lg:py-24">
          <div className="max-w-xl">
            <h2 className="landing-serif text-3xl tracking-tight text-white sm:text-4xl">
              Bring your lab onto one platform
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-300">
              Create an account and open your workspace in minutes.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex items-center justify-center bg-teal-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-500"
            >
              Create account
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center border border-white/25 px-6 py-3 text-sm font-medium text-white transition-colors hover:border-white/50"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 lg:px-8">
          <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-start">
            <div>
              <BrandMark to="/" variant="light" showTagline />
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
                Research intelligence and laboratory operations for academic and applied labs.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-slate-400">
              <Link to="/support" className="transition-colors hover:text-white">
                Support us
              </Link>
              <LegalFooterLinks variant="dark" className="text-sm" />
              <Link to="/login" className="transition-colors hover:text-white">
                Sign in
              </Link>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} RILOS
          </p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
