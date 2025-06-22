
# Product Requirements Document (PRD)

## Empathic Sign-Language Therapy Assistant – MVP

**Document Version:** 0.1  |  **Date:** 21 Jun 2025  |  **Author:** Vaibhav / ChatGPT

---

### 1  Purpose
Provide Deaf and hard-of-hearing (HoH) users with an accessible, emotion-aware virtual therapy tool that:
1. Accepts *text* input translated from ASL (full signing support deferred to a later phase).
2. Detects the user’s current emotional state from live webcam video using **Hume AI**.
3. Crafts an empathetic, therapist-style response via **Claude**.
4. Returns the response as on-screen text **and** synthesized speech through **Vapi**.

### 2  Goals & Success Metrics
| Goal | Metric | Target |
|------|--------|--------|
|Fast feedback|End-to-end latency (input → voice) | ≤ 2 s p95|
|Emotion accuracy|Match human-labeled emotion on test clips|≥ 80 %|
|User satisfaction|Pilot survey rating|≥ 4 / 5|
|Accessibility|WCAG 2.1 AA compliance|Full ✓|

### 3  Non-Goals (MVP)
- Real-time ASL gesture recognition (we accept text only for now).
- Multilingual sign-language support (focus is ASL users who can type).
- Clinical diagnosis or crisis‑management features.

### 4  User Personas
| Persona | Description | Needs |
|---------|-------------|-------|
|**Deaf Adult**|Uses ASL as primary language; comfortable typing in English.|Private, empathic conversation; signed or spoken feedback.|
|**Licensed Therapist**|Facilitates remote sessions using the tool with clients.|Reliable emotion cues; low‑latency voice output.|
|**Family Member**|Participates in joint session.|Readable captions; shared audio.|

### 5  Key Use Cases
1. **Self‑help chat** – User types *“I feel overwhelmed”* → system detects *sad* affect → provides calm grounding exercise.  
2. **Guided therapy session** – Therapist watches output; user sees and hears supportive prompts.  
3. **Family involvement** – Voice output allows hearing family to follow the conversation.

### 6  Functional Requirements
| ID | Requirement |
|----|-------------|
|F‑1|The frontend SHALL capture live webcam frames at ≤ 15 fps for emotion analysis.|
|F‑2|The backend SHALL send frames to Hume Face API and receive top‑3 emotions (valence, arousal, primary label).|
|F‑3|The system SHALL accept plain‑text user intent (typed or future ASL translation).|
|F‑4|The backend SHALL construct a JSON payload `{intent, emotion, session_context}` and call Claude.|
|F‑5|Claude response SHALL be rendered as on‑screen text and passed to Vapi for TTS.|
|F‑6|The frontend SHALL show real‑time captions during voice playback.|

### 7  Non‑Functional Requirements
- **Performance:** ≤ 2 s p95 latency.  
- **Reliability:** ≥ 99 % uptime.  
- **Privacy:** GDPR & HIPAA readiness; no video frames stored.  
- **Accessibility:** WCAG 2.1 AA, high‑contrast UI, keyboard navigation.  
- **Localization:** Text UI supports i18n; core copy in EN‑US.

### 8  System Architecture (High‑Level)
```
[Web Client]
   │ typed text / webcam frames
   ▼
[Backend (Next.js API / FastAPI)]
   │→ Hume AI (emotion)
   │→ Claude (API)
   │← text response
   ▼
[Vapi TTS] → 🎤 voice stream
   ▼
[Web Client] → show text + play audio
```

### 9  Tech Stack Choices
| Layer | Tool |
|-------|------|
|Frontend | React + Next.js (TypeScript) |
|State Mgmt | Zustand |
|Emotion Detection | Hume AI Face SDK |
|LLM | Claude 3 (Anthropic) |
|TTS | Vapi |
|Hosting | Vercel (edge functions) |
|Data | Supabase (Postgres, Auth) – future |

### 10  API Contracts
```ts
// /api/message  (POST)
interface ClientPayload {
  sessionId: string;
  intentText: string;   // translated ASL
  frameBase64?: string; // JPEG frame (optional)
}

interface ServerResponse {
  botText: string;
  emotion: {
    label: string;
    confidence: number;
  };
  audioUrl: string; // Vapi stream endpoint
}
```

### 11  MVP Feature List
- ✅ Typed text input box  
- ✅ Webcam emotion detection toggle  
- ✅ Claude integration with prompt templating  
- ✅ Vapi voice playback & captions  
- ✅ Basic session log (localStorage)

### 12  Future Work
- Real‑time ASL gesture recognition (MediaPipe + classifier).  
- Sign‑language avatar to *sign back* responses.  
- Multi‑party rooms & therapist dashboard.  
- Emotion trend analytics over time.

### 13  Assumptions & Risks
- Users have stable internet & webcam.  
- Hume latency is < 300 ms avg; else caching fallback.  
- HIPAA compliance tasks may extend timeline.

### 14  Open Questions
1. Which Claude model tier & cost guardrails?  
2. Will sessions be stored for therapist review?  
3. Do we need parental consent flows for minors?

---

**End of Document**
