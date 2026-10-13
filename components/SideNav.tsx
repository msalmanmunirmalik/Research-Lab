import React from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import BrandMark from './BrandMark';
import {
  BookOpenIcon,
  BeakerIcon,
  ChartBarIcon,
  BriefcaseIcon,
  Squares2X2Icon,
  PresentationChartLineIcon,
  UsersIcon,
  DatabaseIcon,
  PackageIcon,
  CogIcon,
  DocumentTextIcon,
  WrenchScrewdriverIcon,
  AcademicCapIcon,
  BarChartIcon,
  FlaskConicalIcon,
  HeartIcon,
} from './icons';

interface SideNavProps {
  onMobileLinkClick?: () => void;
}

interface NavItem {
  name: string;
  to: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  description: string;
  /** When set, clicking always navigates with this state (e.g. reset Writing Studio home). */
  resetState?: Record<string, unknown>;
  end?: boolean;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

/** Primary signed-in IA — see docs/RILOS_ALIGNMENT_PLAN.md */
const navSections: NavSection[] = [
  {
    items: [
      {
        name: 'Dashboard',
        to: '/dashboard',
        icon: PresentationChartLineIcon,
        description: 'Notes, reminders, and research pulse',
      },
    ],
  },
  {
    label: 'Records',
    items: [
      {
        name: 'Experiments',
        to: '/experiment-tracker',
        icon: FlaskConicalIcon,
        description: 'Design studies, link methods, capture findings',
      },
      {
        name: 'Data & Results',
        to: '/data-results',
        icon: ChartBarIcon,
        description: 'Curated results with provenance and interpretation',
      },
      {
        name: 'Notebook',
        to: '/lab-notebook',
        icon: BookOpenIcon,
        description: 'Personal notes — ideas, problems, and import',
      },
    ],
  },
  {
    label: 'Lab workspace',
    items: [
      {
        name: 'Workspace',
        to: '/lab-workspace',
        icon: Squares2X2Icon,
        description: 'Tasks, projects, resources, team, and messaging',
      },
      {
        name: 'Trainings',
        to: '/tools-trainings',
        icon: AcademicCapIcon,
        description: 'Lab orientation, safety, techniques, and skill courses',
      },
      {
        name: 'Wellbeing',
        to: '/wellbeing',
        icon: HeartIcon,
        description: 'Private, voluntary researcher check-ins',
      },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      {
        name: 'Data analysis',
        to: '/data-analysis',
        icon: BarChartIcon,
        description: 'Statistical analysis and visualization',
      },
      {
        name: 'Literature',
        to: '/writing-studio/tools/library',
        icon: BookOpenIcon,
        description: 'Evidence and reference library in Writing Studio',
      },
      {
        name: 'Writing studio',
        to: '/writing-studio',
        icon: DocumentTextIcon,
        description: 'Draft, cite, check readiness, and export manuscripts',
        resetState: { studioHome: true },
      },
      {
        name: 'Research tools',
        to: '/research-tools',
        icon: WrenchScrewdriverIcon,
        description: 'Calculators and designers for lab work',
      },
      {
        name: 'Databank',
        to: '/research-databank',
        icon: DatabaseIcon,
        description: 'Cross-org ethical dataset exchange',
      },
      {
        name: 'Grants & funding',
        to: '/grants-fundings',
        icon: BriefcaseIcon,
        description: 'Discover grants, funding calls, and matches',
      },
    ],
  },
  {
    label: 'Network',
    items: [
      {
        name: 'Networking',
        to: '/collaboration-networking',
        icon: UsersIcon,
        description: 'Connect with researchers and labs',
      },
      {
        name: 'Marketplace',
        to: '/marketplace',
        icon: PackageIcon,
        description: 'Supplies, expertise, and tenders directory',
      },
    ],
  },
];

const SideNav: React.FC<SideNavProps> = ({ onMobileLinkClick }) => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="h-full flex flex-col bg-[#F8FAF9] border-r border-slate-200">
      <div className="h-14 px-4 flex items-center border-b border-slate-200 flex-shrink-0">
        <BrandMark
          to="/dashboard"
          variant="app"
          compact
          onClick={onMobileLinkClick}
        />
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto" data-testid="side-nav">
        <div className="space-y-6">
          {navSections.map((section, sectionIndex) => (
            <div key={section.label ?? `primary-${sectionIndex}`}>
              {section.label && (
                <p className="px-3 mb-1.5 text-[11px] font-medium text-slate-400 tracking-wide uppercase">
                  {section.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={`${item.name}-${item.to}`}>
                    <NavLink
                      to={item.to}
                      end={item.end ?? item.to !== '/writing-studio'}
                      onClick={(e) => {
                        onMobileLinkClick?.();
                        if (item.resetState) {
                          e.preventDefault();
                          navigate(
                            { pathname: '/writing-studio', search: '' },
                            {
                              state: {
                                ...item.resetState,
                                studioHomeAt: Date.now(),
                              },
                              replace: location.pathname.startsWith('/writing-studio'),
                            }
                          );
                        }
                      }}
                      title={item.description}
                      data-testid={`nav-${item.to.replace(/^\//, '').replace(/\//g, '-')}`}
                      className={({ isActive }) =>
                        [
                          'group relative flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] transition-colors duration-150',
                          isActive
                            ? 'bg-teal-800/[0.08] text-teal-950 font-medium'
                            : 'text-slate-600 font-normal hover:bg-slate-900/[0.04] hover:text-slate-900',
                        ].join(' ')
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span
                              className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-full bg-teal-700"
                              aria-hidden="true"
                            />
                          )}
                          <item.icon
                            className={[
                              'w-[15px] h-[15px] flex-shrink-0 transition-colors',
                              isActive
                                ? 'text-teal-700'
                                : 'text-slate-400 group-hover:text-slate-600',
                            ].join(' ')}
                            aria-hidden="true"
                          />
                          <span className="truncate">{item.name}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className="px-3 py-3 border-t border-slate-200 flex-shrink-0 space-y-0.5">
        <NavLink
          to="/settings"
          onClick={onMobileLinkClick}
          data-testid="nav-settings"
          className={({ isActive }) =>
            [
              'flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] transition-colors',
              isActive
                ? 'bg-teal-800/[0.08] text-teal-950 font-medium'
                : 'text-slate-600 hover:bg-slate-900/[0.04] hover:text-slate-900',
            ].join(' ')
          }
        >
          <CogIcon className="w-[15px] h-[15px] text-slate-400" aria-hidden="true" />
          Settings
        </NavLink>
      </div>
    </div>
  );
};

export default SideNav;
