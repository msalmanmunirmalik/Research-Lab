import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import SideNav from './components/SideNav';
import ProtectedRoute from './components/ProtectedRoute';
import CookieBanner from './components/CookieBanner';
import { isWritingStudioEditorPath } from './utils/writingStudioRoutes';

// Import all pages
import LabNotebookPage from './pages/LabNotebookPage';
import DashboardPage from './pages/DashboardPage';
import ProtocolsPageRefactored from './pages/ProtocolsPageRefactored';
import DataResultsPage from './pages/DataResultsPage';
import ResearchDataBankPage from './pages/ResearchDataBankPage';
import ResearchDataBankOrgPage from './pages/ResearchDataBankOrgPage';
import ConferenceNewsPage from './pages/ConferenceNewsPage';
import MarketplacePage from './pages/MarketplacePage';
import SupplierWorkspacePage from './pages/SupplierWorkspacePage';
import ServiceProviderWorkspacePage from './pages/ServiceProviderWorkspacePage';
import LabWorkspacePage from './pages/LabWorkspacePage';
import NegativeResultsPage from './pages/NegativeResultsPage';
import ProjectManagementPage from './pages/ProjectManagementPage';
import PIReviewDashboardPage from './pages/PIReviewDashboardPage';
import CollaborationNetworkingPage from './pages/CollaborationNetworkingPage';
import EventsOpportunitiesPage from './pages/EventsOpportunitiesPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';

import DataAnalyticsPage from './pages/DataAnalyticsPage';
import LandingPage from './pages/LandingPage';
import SupportUsPage from './pages/SupportUsPage';
import TeamManagementPage from './pages/TeamManagementPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import CookiePolicyPage from './pages/CookiePolicyPage';
import CookiePreferencesPage from './pages/CookiePreferencesPage';
import PrivacyRightsPage from './pages/PrivacyRightsPage';
import TermsOfServicePage from './pages/TermsOfServicePage';
import GrantsFundingsPage from './pages/GrantsFundingsPage';
import NotFoundPage from './pages/NotFoundPage';
import NotificationsPage from './pages/NotificationsPage';
import NotificationBell from './components/NotificationBell';
import HelpForumPage from './pages/HelpForumPage';
import CurrentTrendsPage from './pages/CurrentTrendsPage';
import LabPublicPage from './pages/LabPublicPage';
import WritingStudioPage from './pages/WritingStudioPage';
import ExperimentTrackerPage from './pages/ExperimentTrackerPage';
import LabFloorsPage from './pages/LabFloorsPage';
import WellbeingPage from './pages/WellbeingPage';
import ContextualResearchCopilot from './components/ContextualResearchCopilot';
import { RedirectToWritingStudio } from './components/RedirectToWritingStudio';
import BrandMark from './components/BrandMark';
import { HeartIcon } from './components/icons';

const LabSectionRedirect: React.FC<{ section: string; tab?: string }> = ({ section, tab }) => {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set('section', section);
  if (tab) next.set('tab', tab);
  return <Navigate to={`/lab-workspace?${next.toString()}`} replace />;
};
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const immersiveStudio = isWritingStudioEditorPath(location.pathname);
  
  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.user-menu')) {
        setShowUserMenu(false);
      }
    };
    
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  React.useEffect(() => {
    if (!mobileNavOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileNavOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  const closeMobileNav = () => setMobileNavOpen(false);

  if (immersiveStudio) {
    return (
      <div className="h-[100dvh] min-h-screen overflow-hidden bg-white">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50/40">
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-60 min-h-screen flex-shrink-0 sticky top-0 h-screen">
          <div className="h-full w-full overflow-hidden">
            <SideNav />
          </div>
        </aside>

        {/* Mobile sidebar overlay */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]"
              aria-label="Close navigation menu"
              onClick={closeMobileNav}
            />
            <aside className="relative w-64 max-w-[85vw] h-full shadow-2xl">
              <SideNav onMobileLinkClick={closeMobileNav} />
            </aside>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 h-14 border-b border-slate-200 bg-[#F8FAF9]">
            <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-900/[0.04] hover:text-slate-900 transition-colors"
                  aria-label="Open navigation menu"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
                <div className="min-w-0 lg:hidden">
                  <BrandMark to="/dashboard" variant="app" compact />
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                <Link
                  to="/support"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-slate-600 hover:bg-slate-900/[0.04] hover:text-teal-800 transition-colors"
                  title="Support us"
                >
                  <HeartIcon className="w-4 h-4 text-teal-700 flex-shrink-0" aria-hidden="true" />
                  <span className="hidden sm:inline">Support us</span>
                </Link>
                <NotificationBell />
                <div className="relative user-menu">
                  <button
                    data-testid="user-menu-toggle"
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white pl-1 pr-2.5 py-1 text-sm font-medium transition-colors hover:bg-slate-50"
                    aria-expanded={showUserMenu}
                    aria-haspopup="true"
                  >
                    <div className="w-7 h-7 rounded-md bg-teal-800 flex items-center justify-center text-white font-semibold text-[11px] tracking-wide">
                      {user?.first_name?.[0]}
                      {user?.last_name?.[0]}
                    </div>
                    <span className="hidden sm:inline text-slate-800 truncate max-w-[120px]">
                      {user?.first_name}
                    </span>
                    <svg
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showUserMenu && (
                    <div
                      className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg py-1.5 z-50"
                      data-testid="user-menu-dropdown"
                    >
                      <div className="px-4 py-3 border-b border-slate-100 bg-[#F8FAF9]">
                        <p className="text-sm font-semibold text-slate-900">
                          {user?.first_name} {user?.last_name}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{user?.email}</p>
                        {user?.role && (
                          <p className="mt-2 inline-flex rounded-md bg-teal-800/10 px-2 py-0.5 text-[11px] font-medium text-teal-900">
                            {user.role}
                          </p>
                        )}
                      </div>

                      <div className="py-1">
                        <Link
                          to="/profile"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-slate-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          Research profile
                        </Link>
                        <Link
                          to="/settings"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <svg className="w-4 h-4 text-slate-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Settings
                        </Link>
                      </div>

                      <div className="border-t border-slate-100 my-1" />

                      <div className="py-1">
                        <button
                          data-testid="sign-out-button"
                          onClick={async () => {
                            try {
                              await logout();
                              setShowUserMenu(false);
                            } catch (error) {
                              console.error('Logout error:', error);
                            }
                          }}
                          className="w-full flex items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013 3v1" />
                          </svg>
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 bg-gradient-to-br from-slate-50 via-white to-sky-50/40 min-h-screen">
            <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
          <ContextualResearchCopilot />
        </div>
      </div>
    </div>
  );
};

// Main App Component
const AppContent: React.FC = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/cookies" element={<CookiePolicyPage />} />
      <Route path="/cookie-policy" element={<Navigate to="/cookies" replace />} />
      <Route path="/cookie-preferences" element={<CookiePreferencesPage />} />
      <Route path="/privacy-rights" element={<PrivacyRightsPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/support" element={<SupportUsPage />} />
      
      {/* Redirects */}
      <Route path="/home" element={<Navigate to="/dashboard" replace />} />
      <Route path="/tasks/new" element={<Navigate to="/dashboard" replace />} />
      <Route path="/team" element={<Navigate to="/dashboard" replace />} />
      <Route path="/professional-protocols" element={<Navigate to="/protocols" replace />} />
      <Route path="/calculator-hub" element={<Navigate to="/dashboard" replace />} />
      <Route path="/research-tools" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/ai-research-agent"
        element={
          <ProtectedRoute>
            <RedirectToWritingStudio />
          </ProtectedRoute>
        }
      />
      <Route
        path="/research-journey"
        element={
          <ProtectedRoute>
            <RedirectToWritingStudio flow="generate" />
          </ProtectedRoute>
        }
      />
      <Route path="/ai-agents-capabilities" element={<Navigate to="/writing-studio" replace />} />
      <Route path="/research-assistant" element={<Navigate to="/writing-studio" replace />} />
      <Route path="/presentations" element={<Navigate to="/writing-studio?notice=slides" replace />} />
      <Route
        path="/ai-presentations"
        element={
          <ProtectedRoute>
            <RedirectToWritingStudio flow="present" />
          </ProtectedRoute>
        }
      />
      {/* Writing Studio — each surface has its own route (desk / new / compose / manuscript / tools) */}
      <Route
        path="/writing-studio"
        element={
          <ProtectedRoute>
            <AppLayout><WritingStudioPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/writing-studio/new"
        element={
          <ProtectedRoute>
            <AppLayout><WritingStudioPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/writing-studio/new/:docType"
        element={
          <ProtectedRoute>
            <AppLayout><WritingStudioPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/writing-studio/compose/:templateId"
        element={
          <ProtectedRoute>
            <AppLayout><WritingStudioPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/writing-studio/compose/:templateId/s/:sectionId"
        element={
          <ProtectedRoute>
            <AppLayout><WritingStudioPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/writing-studio/compose/:templateId/s/:sectionId/:panel"
        element={
          <ProtectedRoute>
            <AppLayout><WritingStudioPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/writing-studio/m/:docId"
        element={
          <ProtectedRoute>
            <AppLayout><WritingStudioPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/writing-studio/m/:docId/s/:sectionId"
        element={
          <ProtectedRoute>
            <AppLayout><WritingStudioPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/writing-studio/m/:docId/s/:sectionId/:panel"
        element={
          <ProtectedRoute>
            <AppLayout><WritingStudioPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/writing-studio/tools/:toolId"
        element={
          <ProtectedRoute>
            <AppLayout><WritingStudioPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/evidence-references"
        element={
          <ProtectedRoute>
            <RedirectToWritingStudio flow="library" />
          </ProtectedRoute>
        }
      />
      <Route path="/bioinformatics-tools" element={<Navigate to="/dashboard" replace />} />
      <Route path="/molecular-biology" element={<Navigate to="/dashboard" replace />} />
      <Route path="/data-sharing" element={<Navigate to="/research-databank" replace />} />
      <Route path="/supplier-marketplace" element={<Navigate to="/marketplace?tab=suppliers" replace />} />
      <Route path="/service-marketplace" element={<Navigate to="/marketplace?tab=services" replace />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      
      {/* Protected routes */}
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <AppLayout><DashboardPage /></AppLayout>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/lab-notebook" 
        element={
          <ProtectedRoute>
            <AppLayout><LabNotebookPage /></AppLayout>
          </ProtectedRoute>
        } 
      />
      
      <Route path="/lab-workspace" 
        element={
          <ProtectedRoute>
            <AppLayout><LabWorkspacePage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/lab-floors"
        element={
          <ProtectedRoute>
            <AppLayout><LabFloorsPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/wellbeing"
        element={
          <ProtectedRoute>
            <AppLayout><WellbeingPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/experiment-tracker"
        element={
          <ProtectedRoute>
            <AppLayout><ExperimentTrackerPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team-messaging"
        element={<LabSectionRedirect section="teams" tab="messages" />}
      />

      {/* Protocols - All authenticated users */}
      <Route 
        path="/protocols"
        element={
          <ProtectedRoute>
            <AppLayout><ProtocolsPageRefactored /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/protocols/:protocolId"
        element={
          <ProtectedRoute>
            <AppLayout><ProtocolsPageRefactored /></AppLayout>
          </ProtectedRoute>
        }
      />
      
      
      {/* Data Results - All authenticated users */}
      <Route 
        path="/data-results" 
        element={
          <ProtectedRoute>
            <AppLayout><DataResultsPage /></AppLayout>
          </ProtectedRoute>
        } 
      />

      {/* Research collaboration routes - All authenticated users */}
      <Route 
        path="/research-databank" 
        element={
          <ProtectedRoute>
            <AppLayout><ResearchDataBankPage /></AppLayout>
          </ProtectedRoute>
        } 
      />
      <Route
        path="/research-databank/:orgId"
        element={
          <ProtectedRoute>
            <AppLayout><ResearchDataBankOrgPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route 
        path="/marketplace" 
        element={
          <ProtectedRoute>
            <AppLayout><MarketplacePage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/marketplace/supplier"
        element={
          <ProtectedRoute>
            <AppLayout><SupplierWorkspacePage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/marketplace/provider"
        element={
          <ProtectedRoute>
            <AppLayout><ServiceProviderWorkspacePage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route 
        path="/negative-results" 
        element={
          <ProtectedRoute>
            <AppLayout><NegativeResultsPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route 
        path="/project-management" 
        element={
          <ProtectedRoute>
            <AppLayout><ProjectManagementPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route 
        path="/pi-review-dashboard" 
        element={
          <ProtectedRoute>
            <AppLayout><PIReviewDashboardPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route 
        path="/data-analysis" 
        element={
          <ProtectedRoute>
            <AppLayout><DataAnalyticsPage /></AppLayout>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/data-analytics" 
        element={
          <ProtectedRoute>
            <AppLayout><DataAnalyticsPage /></AppLayout>
          </ProtectedRoute>
        } 
      />
      {/* Collaboration Routes */}
      <Route 
        path="/collaboration-networking" 
        element={
          <ProtectedRoute>
            <AppLayout><CollaborationNetworkingPage /></AppLayout>
          </ProtectedRoute>
        } 
      />
      <Route
        path="/labs/:labId"
        element={
          <ProtectedRoute>
            <AppLayout><LabPublicPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route 
        path="/events-opportunities" 
        element={
          <ProtectedRoute>
            <AppLayout><EventsOpportunitiesPage /></AppLayout>
          </ProtectedRoute>
        } 
      />
      <Route
        path="/grants-fundings"
        element={
          <ProtectedRoute>
            <AppLayout><GrantsFundingsPage /></AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Profile and Settings Routes */}
      {/* Profile - unified research identity */}
      <Route 
        path="/profile" 
        element={
          <ProtectedRoute>
            <AppLayout><ProfilePage /></AppLayout>
          </ProtectedRoute>
        } 
      />
      <Route
        path="/profile/:userId"
        element={
          <ProtectedRoute>
            <AppLayout><ProfilePage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route path="/my-portfolio" element={<Navigate to="/profile" replace />} />
      <Route path="/scientist-passport" element={<Navigate to="/profile" replace />} />
      <Route 
        path="/settings" 
        element={
          <ProtectedRoute>
            <AppLayout><SettingsPage /></AppLayout>
          </ProtectedRoute>
        } 
      />
            {/* Conference News UI is empty; Events is the source of truth (RILOS alignment). */}
      <Route path="/conference-news" element={<Navigate to="/events-opportunities" replace />} />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <AppLayout><NotificationsPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/help-forum"
        element={
          <ProtectedRoute>
            <AppLayout><HelpForumPage /></AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/current-trends"
        element={
          <ProtectedRoute>
            <AppLayout><CurrentTrendsPage /></AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Catch-all route */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
        <CookieBanner />
      </Router>
    </AuthProvider>
  );
};

export default App;