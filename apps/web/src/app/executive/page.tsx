import { redirect } from 'next/navigation';

// 2026-04-27 — per G's direct order: the heavy 30-page Pro suite at
// /executive (CXO grid + Presenter Deck + AI insights + agentic actions
// + 30-route sidebar) is hidden from the Nexus CXO demo path. Any visit
// to /executive bounces to the simple Boardroom home (/) which is the
// 4-tile + chart + table dial-down view Arjit asked for.
//
// The Pro page module still exists in git history if it ever needs to
// come back — see commit before 2026-04-27.
export default function ExecutivePage(): never {
  redirect('/');
}
