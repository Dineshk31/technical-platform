import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminAssessmentDetailPage } from './pages/AdminAssessmentDetailPage';
import { AdminQuestionBankPage } from './pages/AdminQuestionBankPage';
import { AdminQuestionFormPage } from './pages/AdminQuestionFormPage';
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
        path="/admin"
        element={
          <ProtectedRoute allow={['ADMIN']}>
            <AdminDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/assessments/:id"
        element={
          <ProtectedRoute allow={['ADMIN']}>
            <AdminAssessmentDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/questions"
        element={
          <ProtectedRoute allow={['ADMIN']}>
            <AdminQuestionBankPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/questions/new"
        element={
          <ProtectedRoute allow={['ADMIN']}>
            <AdminQuestionFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/questions/:id/edit"
        element={
          <ProtectedRoute allow={['ADMIN']}>
            <AdminQuestionFormPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/assessments/:id/results"
        element={
          <ProtectedRoute allow={['ADMIN']}>
            <AdminResultsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/assessments/:id/results/:attemptId"
        element={
          <ProtectedRoute allow={['ADMIN']}>
            <AdminResultDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student"
        element={
          <ProtectedRoute allow={['STUDENT']}>
            <StudentDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/assessments/:id"
        element={
          <ProtectedRoute allow={['STUDENT']}>
            <StudentAssessmentDetailPage />
          </ProtectedRoute>
        }
      />
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
      <Route
        path="/student/attempts/:attemptId/result"
        element={
          <ProtectedRoute allow={['STUDENT']}>
            <StudentResultPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
