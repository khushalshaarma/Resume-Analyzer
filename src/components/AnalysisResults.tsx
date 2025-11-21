import React, { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertCircle, TrendingUp, Award } from "lucide-react";

interface AnalysisType {
  score: number;
  atsCompatibility: number;
  skills: string[];
  experience: Array<{ title: string; company: string; duration: string }>;
  education: Array<{ degree: string; institution: string; year: string }>;
  recommendations: string[];
  strengths: string[];
  improvements: string[];
}

interface AnalysisResultsProps {
  analysis?: AnalysisType | null;
}

export const AnalysisResults = ({ analysis }: AnalysisResultsProps) => {
  const [analysisState, setAnalysisState] = useState<AnalysisType | null>(analysis ?? null);
  const [loading, setLoading] = useState<boolean>(!analysisState);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [extractedText, setExtractedText] = useState<string>("");

  useEffect(() => {
    // If component received analysis prop, prefer it. Otherwise try to load from localStorage.
    if (analysis) {
      setAnalysisState(analysis);
      setLoading(false);
      return;
    }

    const stored = typeof window !== "undefined" ? localStorage.getItem("resumeAnalysis") : null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as AnalysisType;
        setAnalysisState(parsed);
      } catch (e) {
        console.error("Failed to parse stored resume analysis:", e);
        setAnalysisState(null);
      }
    } else {
      setAnalysisState(null);
    }
    setLoading(false);
  }, [analysis]);

  // Extract text from PDF using pdfjs-dist
  const extractTextFromPDF = async (file: File) => {
    setParsing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();

      // Try multiple possible pdfjs entry points to avoid build/import path errors
      let pdfjsModule: any = null;
      const candidates = [
        "pdfjs-dist/legacy/build/pdf",
        "pdfjs-dist/build/pdf",
        "pdfjs-dist/legacy/build/pdf.js",
        "pdfjs-dist/build/pdf.js",
        "pdfjs-dist",
      ];
      for (const p of candidates) {
        try {
          // dynamic import; each environment may expose a different path
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const mod = await import(/* webpackChunkName: "pdfjs" */ p);
          if (mod) {
            pdfjsModule = mod;
            break;
          }
        } catch (e) {
          // try next candidate
        }
      }

      if (!pdfjsModule) {
        throw new Error("Could not load pdfjs-dist. Make sure it is installed.");
      }

      // pdfjs may be exported as default or as the module itself
      const pdfjs = pdfjsModule.default ?? pdfjsModule;

      // set worker src using version if available, otherwise fallback to a known CDN path
      try {
        const version = (pdfjs as any).version || "2.16.105";
        if (pdfjs.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;
        }
      } catch (e) {
        // ignore worker setup failures; pdfjs may still work in some bundlers
      }

      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item: any) => (item.str ? item.str : ""));
        fullText += strings.join(" ") + "\n";
      }
      setExtractedText(fullText);
      setParsing(false);
      return fullText;
    } catch (err) {
      console.error("PDF parsing error:", err);
      setParsing(false);
      // Provide clearer message in UI flow if desired
      return "";
    }
  };

  // Basic analyzer: heuristics for skills, education, experience, recommendations, strengths, improvements
  const analyzeText = (text: string): AnalysisType => {
    const lower = text.toLowerCase();

    const skillsList = [
      "javascript",
      "typescript",
      "react",
      "node",
      "python",
      "java",
      "c++",
      "c#",
      "sql",
      "aws",
      "docker",
      "kubernetes",
      "git",
      "graphql",
      "rest",
      "html",
      "css",
      "next.js",
      "next",
      "tailwind",
      "tailwindcss",
      "figma",
      "leadership",
      "management",
      "communication",
    ];

    const matchedSkills = Array.from(
      new Set(
        skillsList.filter((s) => {
          // match whole word or simple variants
          const key = s.replace(".", "\\.");
          const re = new RegExp(`\\b${key}\\b`, "i");
          return re.test(text);
        })
      )
    );

    // Detection of education lines
    const educationMatches: Array<{ degree: string; institution: string; year: string }> = [];
    const degreeKeywords = ["bachelor", "master", "b.sc", "b.s", "bs", "ms", "mba", "phd", "doctor"];
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const ll = line.toLowerCase();
      if (degreeKeywords.some((d) => ll.includes(d))) {
        const yearMatch = line.match(/\b(19|20)\d{2}\b/);
        educationMatches.push({
          degree: line.trim(),
          institution: "", // hard to reliably separate; keep whole line in degree and let UI show it
          year: yearMatch ? yearMatch[0] : "",
        });
      }
    }

    // Experience heuristics: find lines with years or role keywords
    const experienceMatches: Array<{ title: string; company: string; duration: string }> = [];
    const roleKeywords = ["engineer", "developer", "manager", "designer", "analyst", "consultant", "intern", "lead", "director"];
    for (const line of lines) {
      const hasYear = /\b(19|20)\d{2}\b/.test(line);
      const hasRole = roleKeywords.some((r) => new RegExp(`\\b${r}\\b`, "i").test(line));
      if (hasYear || hasRole) {
        // try split by at / - / , to extract title/company
        let title = line.trim();
        let company = "";
        let duration = "";
        const atSplit = line.split(/ at | @ /i);
        if (atSplit.length >= 2) {
          title = atSplit[0].trim();
          company = atSplit.slice(1).join(" at ").trim();
        } else {
          const dashSplit = line.split(" - ");
          if (dashSplit.length >= 2) {
            title = dashSplit[0].trim();
            duration = dashSplit.slice(1).join(" - ").trim();
          }
        }
        experienceMatches.push({
          title: title,
          company: company,
          duration: duration || (hasYear ? line.match(/\b(19|20)\d{2}.*?(to|-).*?(19|20)\d{2}\b/gi)?.[0] ?? "" : ""),
        });
      }
    }

    // Simple ATS compatibility heuristic
    const hasContact = /(@|\bwww\.|linkedin\.com|phone|tel:|\+?\d{7,})/i.test(text);
    const hasSections = /\b(experience|education|skills|projects|summary|certifications)\b/i.test(text);
    const lengthScore = Math.min(100, Math.round((text.split(/\s+/).length / 800) * 100)); // 800 words ideal approx
    const skillsScore = Math.min(100, Math.round((matchedSkills.length / Math.max(1, skillsList.length)) * 100));
    const atsCompatibility = Math.min(
      100,
      Math.round(skillsScore * 0.6 + (hasContact ? 10 : 0) + (hasSections ? 10 : 0) + lengthScore * 0.1)
    );

    // Overall score heuristic
    const score = Math.min(100, Math.round(40 + matchedSkills.length * 6 + (hasSections ? 5 : 0) + (hasContact ? 5 : 0)));

    // Recommendations, strengths, improvements generation (simple)
    const recommendations: string[] = [];
    if (matchedSkills.length < 5) recommendations.push("Consider adding more relevant technical skills and keywords from the job description.");
    if (!hasContact) recommendations.push("Include clear contact information (email, phone, LinkedIn).");
    if (!hasSections) recommendations.push("Use clear section headings like Experience, Education, and Skills for better ATS parsing.");
    if (text.split(/\s+/).length < 300) recommendations.push("Expand content with measurable accomplishments and metrics.");

    const strengths: string[] = [];
    if (matchedSkills.length > 0) strengths.push(`Has ${matchedSkills.length} identified skill(s): ${matchedSkills.slice(0, 6).join(", ")}`);
    if (educationMatches.length > 0) strengths.push("Education section detected.");

    const improvements: string[] = [];
    if (matchedSkills.length < 3) improvements.push("Add more role-specific keywords and technologies.");
    if (!hasSections) improvements.push("Add explicit section headings to improve ATS compatibility.");

    const result: AnalysisType = {
      score,
      atsCompatibility,
      skills: matchedSkills,
      experience: experienceMatches.slice(0, 8),
      education: educationMatches,
      recommendations,
      strengths,
      improvements,
    };

    return result;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    setSelectedFile(f ?? null);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return alert("Please select a PDF resume to analyze.");
    setParsing(true);
    const text = await extractTextFromPDF(selectedFile);
    if (!text) {
      alert("Failed to extract text from PDF. Make sure the PDF contains selectable text (not an image scan).");
      setParsing(false);
      return;
    }
    const result = analyzeText(text);
    // persist for other pages / reloads
    try {
      localStorage.setItem("resumeAnalysis", JSON.stringify(result));
    } catch (e) {
      console.warn("Could not save analysis to localStorage:", e);
    }
    setAnalysisState(result);
    setParsing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-20">
        <div className="max-w-6xl mx-auto text-center">
          <p>Loading analysis...</p>
        </div>
      </div>
    );
  }

  // Upload UI shown above results; when analysisState exists the existing results display below will render
  return (
    <div className="min-h-screen px-4 py-20">
      <div className="max-w-6xl mx-auto">
        {/* Upload / Analyze Panel */}
        <Card className="glass-card p-6 mb-8">
          <h3 className="text-xl font-semibold mb-4">Upload Resume (PDF)</h3>
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <label htmlFor="resumeFileInput" className="sr-only">Upload resume PDF</label>
            <input
              id="resumeFileInput"
              aria-label="Upload resume PDF"
              title="Upload resume PDF"
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              className="border rounded px-3 py-2 bg-white"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAnalyze}
                disabled={parsing}
                className="px-4 py-2 rounded bg-primary text-white disabled:opacity-60"
              >
                {parsing ? "Analyzing..." : "Analyze Resume"}
              </button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            The analyzer extracts text from your PDF and runs a client-side analysis to produce skills, education, experience,
            ATS score, and recommendations. For scanned PDFs (images) OCR is required and is not handled here.
          </p>
        </Card>

        {/* If no analysis yet, show a helpful empty state */}
        {!analysisState && (
          <div className="glass-card p-8 mb-8 text-center">
            <h3 className="text-lg font-semibold mb-2">No analysis yet</h3>
            <p className="text-muted-foreground">Upload a PDF resume above and click Analyze Resume to see results.</p>
          </div>
        )}

        {/* When analysisState exists, render the existing results UI */}
        {analysisState && (
          <>
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-4">Resume Analysis Complete</h2>
              <p className="text-muted-foreground">Here's your comprehensive AI-powered resume report</p>
            </div>

            {/* Overall Score */}
            <div className="glass-card p-8 mb-8 text-center">
              <div className="inline-flex items-center justify-center w-32 h-32 rounded-full bg-primary/10 mb-4">
                <span className="text-5xl font-bold text-primary">{analysisState.score}</span>
              </div>
              <h3 className="text-2xl font-semibold mb-2">Overall Score</h3>
              <p className="text-muted-foreground">Your resume performs better than {analysisState.score}% of candidates</p>
            </div>

            {/* ATS Compatibility */}
            <Card className="glass-card p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Award className="w-6 h-6 text-secondary" />
                  <h3 className="text-xl font-semibold">ATS Compatibility</h3>
                </div>
                <span className="text-2xl font-bold text-secondary">{analysisState.atsCompatibility}%</span>
              </div>
              <Progress value={analysisState.atsCompatibility} className="h-3 mb-2" />
              <p className="text-sm text-muted-foreground">
                {analysisState.atsCompatibility > 80
                  ? "Excellent! Your resume is highly optimized for ATS systems."
                  : "Good progress! Consider implementing the recommendations below."}
              </p>
            </Card>

            {/* Two Column Layout */}
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              {/* Strengths */}
              <Card className="glass-card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                  <h3 className="text-xl font-semibold">Strengths</h3>
                </div>
                <ul className="space-y-3">
                  {analysisState.strengths.map((strength, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-primary mt-1 flex-shrink-0" />
                      <span>{strength}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              {/* Areas for Improvement */}
              <Card className="glass-card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <TrendingUp className="w-6 h-6 text-secondary" />
                  <h3 className="text-xl font-semibold">Areas for Improvement</h3>
                </div>
                <ul className="space-y-3">
                  {analysisState.improvements.map((improvement, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <AlertCircle className="w-4 h-4 text-secondary mt-1 flex-shrink-0" />
                      <span>{improvement}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            {/* Skills */}
            <Card className="glass-card p-6 mb-8">
              <h3 className="text-xl font-semibold mb-4">Identified Skills</h3>
              <div className="flex flex-wrap gap-2">
                {analysisState.skills.map((skill, index) => (
                  <Badge key={index} variant="secondary" className="px-3 py-1">
                    {skill}
                  </Badge>
                ))}
              </div>
            </Card>

            {/* Experience */}
            <Card className="glass-card p-6 mb-8">
              <h3 className="text-xl font-semibold mb-4">Experience</h3>
              <div className="space-y-4">
                {analysisState.experience.map((exp, index) => (
                  <div key={index} className="border-l-2 border-primary pl-4">
                    <h4 className="font-semibold">{exp.title}</h4>
                    <p className="text-sm text-muted-foreground">{exp.company}</p>
                    <p className="text-xs text-muted-foreground">{exp.duration}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Education */}
            <Card className="glass-card p-6 mb-8">
              <h3 className="text-xl font-semibold mb-4">Education</h3>
              <div className="space-y-4">
                {analysisState.education.map((edu, index) => (
                  <div key={index}>
                    <h4 className="font-semibold">{edu.degree}</h4>
                    <p className="text-sm text-muted-foreground">{edu.institution}</p>
                    <p className="text-xs text-muted-foreground">{edu.year}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Recommendations */}
            <Card className="glass-card p-6">
              <h3 className="text-xl font-semibold mb-4">AI Recommendations</h3>
              <div className="space-y-3">
                {analysisState.recommendations.map((rec, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-primary/5">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">{index + 1}</span>
                    </div>
                    <p className="text-sm">{rec}</p>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};
