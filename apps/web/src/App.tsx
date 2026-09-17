/**
 * Route table. Pages are thin: they fetch via hooks in lib/hooks.ts and compose components.
 *
 *   /                              Dashboard      resume, streak, cards due, module cards w/ progress
 *   /modules/:moduleId             ModulePage     topic list; per-level progress bars
 *   /topics/:moduleId/:slug        TopicPage      level selector + mode toggle + LessonRenderer
 *   /review                        ReviewPage     quick quiz / flashcards launcher ("between meetings")
 *   /review/quiz/:sessionId        (inside ReviewPage) QuizRunner
 *   /review/cards                  (inside ReviewPage) FlashcardRunner
 *   /settings                      SettingsPage   defaults, API token
 *
 * AuthGate wraps everything: with no token in localStorage the API answers 401 to every route, so
 * the app asks for the token once instead of rendering a page of failures.
 */
import { Link, Route, Routes } from 'react-router-dom';
import { AuthGate } from './components/AuthGate';
import { Shell } from './components/Shell';
import { Empty } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { ModulePage } from './pages/ModulePage';
import { ReviewPage } from './pages/ReviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { TopicPage } from './pages/TopicPage';

export function App() {
  return (
    <AuthGate>
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/modules/:moduleId" element={<ModulePage />} />
          <Route path="/topics/:moduleId/:slug" element={<TopicPage />} />
          <Route path="/review/*" element={<ReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Shell>
    </AuthGate>
  );
}

function NotFound() {
  return (
    <Empty
      title="No page at this address"
      action={
        <Link to="/" className="label border border-rule-strong px-2.5 py-1.5 text-ink hover:border-ink-3">
          Back to the curriculum
        </Link>
      }
    >
      The link may be from an older build of the content.
    </Empty>
  );
}
