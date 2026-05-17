import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import InterviewPrepListPage from "./InterviewPrepListPage.jsx";
import InterviewPrepPage from "./InterviewPrepPage.jsx";
import {
  clearInterviewPrepWorkspaceSession,
  INTERVIEW_PREP_LIST_PATH,
  INTERVIEW_PREP_SESSION_PATH,
  isInterviewPrepInWorkspaceSession,
  markInterviewPrepInWorkspace,
} from "../utils/interviewPrepNav.js";

function InterviewPrepListGate() {
  const location = useLocation();
  if (location.state?.preferListing) {
    clearInterviewPrepWorkspaceSession();
    return <InterviewPrepListPage />;
  }
  if (location.state?.directWorkspace) {
    markInterviewPrepInWorkspace();
    return <Navigate to={INTERVIEW_PREP_SESSION_PATH} replace state={undefined} />;
  }
  if (isInterviewPrepInWorkspaceSession()) {
    return <Navigate to={INTERVIEW_PREP_SESSION_PATH} replace />;
  }
  return <InterviewPrepListPage />;
}

function InterviewPrepSessionGate() {
  useEffect(() => {
    markInterviewPrepInWorkspace();
  }, []);
  return <InterviewPrepPage />;
}

export default function InterviewPrepRouter() {
  useEffect(() => {
    const onSessionApplied = () => clearInterviewPrepWorkspaceSession();
    window.addEventListener("ng-cloud-session-applied", onSessionApplied);
    return () => window.removeEventListener("ng-cloud-session-applied", onSessionApplied);
  }, []);

  return (
    <Routes>
      <Route index element={<InterviewPrepListGate />} />
      <Route path="session" element={<InterviewPrepSessionGate />} />
      <Route path="*" element={<Navigate to={INTERVIEW_PREP_LIST_PATH} replace />} />
    </Routes>
  );
}
