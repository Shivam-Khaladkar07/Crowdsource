import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Landmark, University, Factory } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  ["Citizen report", "A resident files a societal challenge with place, severity, and evidence."],
  ["Demo AI analysis", "Keyword classification, summary, and embeddings. Labeled Demo AI Mode."],
  ["Human validation", "Panchayat/ULB officer accepts or rejects. AI never auto-validates."],
  ["Challenge cluster", "Related reports become one innovation brief."],
  ["University match", "Configurable scores recommend campuses; an officer approves assignment."],
  ["Team + industry", "Students, faculty, CSR, and startups collaborate."],
  ["Prototype → pilot", "Lab tests, field pilots, then a deployment playbook."],
  ["Measured impact", "Predicted and verified metrics are shown separately."],
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground text-xs px-4 py-2 text-center">
        Demo Environment — SIH 2026 prototype. Synthetic Jharkhand scenarios, not official records.
      </div>
      <header className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">CivicForge — Jharkhand</p>
          <p className="text-xs text-muted-foreground">Government of Jharkhand · SIH 2026 problem statement prototype</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/register">Report a challenge</Link>
          </Button>
        </div>
      </header>
      <section className="max-w-6xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <p className="text-sm text-secondary font-medium">From Community Problems to Deployable Solutions</p>
          <h1 className="mt-2 text-3xl md:text-4xl font-semibold leading-tight text-primary">
            Not a complaint portal. A path from validated problems to collaborative innovation.
          </h1>
          <p className="mt-4 text-muted-foreground">
            Citizens surface education, health, water, livelihoods, and infrastructure challenges. Universities and
            industry turn approved clusters into prototypes, pilots, and measured impact.
          </p>
          <div className="mt-6 flex gap-3">
            <Button asChild>
              <Link to="/login">
                Open the platform <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/login">Use a demo account</Link>
            </Button>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Who the platform connects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex gap-2">
              <Landmark className="h-4 w-4 text-secondary mt-0.5" /> Citizens and panchayat/ULB officers (validate, cluster)
            </p>
            <p className="flex gap-2">
              <University className="h-4 w-4 text-secondary mt-0.5" /> Universities, faculty mentors, student teams
            </p>
            <p className="flex gap-2">
              <Factory className="h-4 w-4 text-secondary mt-0.5" /> Industry, startups, CSR funding and labs
            </p>
            <p className="flex gap-2">
              <CheckCircle2 className="h-4 w-4 text-success mt-0.5" /> Human-in-the-loop for every high-impact decision
            </p>
          </CardContent>
        </Card>
      </section>
      <section className="max-w-6xl mx-auto px-4 pb-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {steps.map(([t, d]) => (
          <Card key={t}>
            <CardHeader>
              <CardTitle className="text-sm">{t}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{d}</CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
