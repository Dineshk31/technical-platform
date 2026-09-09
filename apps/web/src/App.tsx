import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminAssessmentDetailPage } from './pages/AdminAssessmentDetailPage';
import { AdminQuestionBankPage } from './pages/AdminQuestionBankPage';
import { AdminQuestionFormPage } from './pages/AdminQuestionFormPage';
import { AdminMcqFormPage } from './pages/AdminMcqFormPage';
import { AdminAIGeneratorPage } from './pages/AdminAIGeneratorPage';
import { AdminResultsPage } from './pages/AdminResultsPage';
import { AdminResultDetailPage } from './pages/AdminResultDetailPage';
import { StudentDashboardPage } from './pages/StudentDashboardPage';
import { StudentAssessmentDetailPage } from './pages/StudentAssessmentDetailPage';
import { StudentResultPage } from './pages/StudentResultPage';

// Monaco is multiple MB — code-split so only students actually entering an exam pay
// for it, not every page load (admin pages, login, etc. stay on the lean main bundle).
const StudentExamPage = lazy(() => import('./pages/StudentExamPage').then((m) => ({ default: m.StudentExamPage })));

function HomeRedirect() {
  const { user, status } = useAuth();
  if (status === 'loading') return <div className="page-centered">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/student'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute allow={['ADMIN']}>
            <AppShell role="ADMIN" />
          </ProtectedRoute>
        }
      >
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/admin/assessments/:id" element={<AdminAssessmentDetailPage />} />
        <Route path="/admin/questions" element={<AdminQuestionBankPage />} />
        <Route path="/admin/questions/new" element={<AdminQuestionFormPage />} />
        <Route path="/admin/questions/ai-generate" element={<AdminAIGeneratorPage />} />
        <Route path="/admin/questions/mcq/new" element={<AdminMcqFormPage />} />
        <Route path="/admin/questions/mcq/:id/edit" element={<AdminMcqFormPage />} />
        <Route path="/admin/questions/:id/edit" element={<AdminQuestionFormPage />} />
        <Route path="/admin/assessments/:id/results" element={<AdminResultsPage />} />
        <Route path="/admin/assessments/:id/results/:attemptId" element={<AdminResultDetailPage />} />
      </Route>

      <Route
        element={
          <ProtectedRoute allow={['STUDENT']}>
            <AppShell role="STUDENT" />
          </ProtectedRoute>
        }
      >
        <Route path="/student" element={<StudentDashboardPage />} />
        <Route path="/student/assessments/:id" element={<StudentAssessmentDetailPage />} />
        <Route path="/student/attempts/:attemptId/result" element={<StudentResultPage />} />
      </Route>

      {/* The exam-taking route stays outside the app shell — a focused, distraction-free
          full-screen layout, per the exam experience's own dedicated design. */}
      <Route
        path="/student/attempts/:attemptId"
        element={
          <ProtectedRoute allow={['STUDENT']}>
            <Suspense fallback={<div className="page-centered">Loading exam…</div>}>
              <StudentExamPage />
            </Suspense>
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
