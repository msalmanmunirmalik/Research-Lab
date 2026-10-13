import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Button from './ui/Button';
import Card from './ui/Card';
import {
  UserIcon,
  UsersIcon,
  BuildingOfficeIcon,
  UserPlusIcon,
  UserMinusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  MapPinIcon,
  AcademicCapIcon,
  HeartIcon,
  EyeIcon,
  CheckIcon,
  XMarkIcon,
  GlobeAltIcon,
} from './icons';
import { PageHeader } from './PageHeader';
import RecommendationsWidget from './RecommendationsWidget';
import ProjectCollaboratorMatchPanel from './ProjectCollaboratorMatchPanel';

interface Lab {
  id: string;
  name: string;
  institution: string;
  department: string;
  location: string;
  city: string;
  country: string;
  description: string;
  tagline?: string;
  fieldOfResearch: string;
  researchAreas: string[];
  lookingFor?: string[];
  lookingForLabels?: string[];
  memberCount: number;
  isMember: boolean;
  isFollowing: boolean;
  membershipStatus: 'none' | 'pending' | 'member';
  membershipRole?: string | null;
  joinRequestId?: string | null;
  canLeave: boolean;
  isOwnLab: boolean;
  foundedYear: number | null;
  website: string;
  hasWebsite: boolean;
  postedByName?: string;
  matchScore?: number;
  matchReasons?: string[];
}

interface MyLabSummary {
  id: string;
  name: string;
  institution: string;
  isShowcased: boolean;
  membershipRole: string;
  tagline: string;
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  institution: string;
  location: string;
  city: string;
  country: string;
  fieldsOfResearch: string[];
  fieldOfResearch: string;
  researchInterests: string[];
  profilePicture?: string;
  isConnected: boolean;
  isFollowing: boolean;
  connectionStatus: 'none' | 'pending' | 'connected';
  connectionDirection?: 'out' | 'in' | null;
  connectionId?: string | null;
  careerStage: string;
  openToCollaborate: boolean;
  currentlyAvailable: boolean;
  profileCompleteness: number;
  recentlyActive: boolean;
  hasRemoteSignal: boolean;
  bio: string;
  matchScore?: number;
  matchReasons?: string[];
}

interface IncomingRequest {
  id: string;
  requesterId: string;
  name: string;
  avatarUrl?: string;
  position: string;
  institution: string;
  createdAt: string;
}

interface IncomingLabJoinRequest {
  id: string;
  labId: string;
  labName: string;
  requesterId: string;
  name: string;
  avatarUrl?: string;
  position: string;
  institution: string;
  createdAt: string;
}

interface FilterOptions {
  countries: string[];
  cities: string[];
  fields: string[];
  institutions: string[];
  careerStages: string[];
  lookingFor?: { id: string; label: string }[];
}

interface DirectoryFilters {
  country: string;
  city: string;
  field: string;
  institution: string;
  careerStage: string;
  lookingFor: string;
  openToCollaborate: boolean;
  recentlyActive: boolean;
  profileReady: boolean;
  remoteFriendly: boolean;
  hasWebsite: boolean;
  sameInstitution: boolean;
}

const EMPTY_FILTERS: DirectoryFilters = {
  country: '',
  city: '',
  field: '',
  institution: '',
  careerStage: '',
  lookingFor: '',
  openToCollaborate: false,
  recentlyActive: false,
  profileReady: false,
  remoteFriendly: false,
  hasWebsite: false,
  sameInstitution: false,
};

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5002/api';

const authHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('authToken') || localStorage.getItem('token') || ''}`,
});

const matchField = (haystack: string[], needle: string) => {
  if (!needle) return true;
  const q = needle.toLowerCase();
  return haystack.some((h) => h.toLowerCase().includes(q));
};

const shortRef = (prefix: string, id: string) => {
  const compact = String(id || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-8)
    .toUpperCase();
  return `${prefix}-${compact || '--------'}`;
};

const LinkedInStyleNetworking: React.FC = () => {
  const { user } = useAuth();
  const [labs, setLabs] = useState<Lab[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [viewerHasInterests, setViewerHasInterests] = useState(false);
  const [myLabs, setMyLabs] = useState<MyLabSummary[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    countries: [],
    cities: [],
    fields: [],
    institutions: [],
    careerStages: [],
    lookingFor: [],
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'labs' | 'members'>('all');
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [incomingLabJoinRequests, setIncomingLabJoinRequests] = useState<IncomingLabJoinRequest[]>(
    []
  );
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCollaboratorMatch, setShowCollaboratorMatch] = useState(false);

  const myInstitution = (user as any)?.current_institution || (user as any)?.institution || '';

  useEffect(() => {
    void loadDirectory();
  }, []);

  const loadIncomingRequests = async () => {
    try {
      const [peopleRes, labsRes] = await Promise.all([
        fetch(`${API_BASE}/networking/social/requests`, { headers: authHeaders() }),
        fetch(`${API_BASE}/networking/social/labs/join-requests`, { headers: authHeaders() }),
      ]);
      if (peopleRes.ok) {
        const data = await peopleRes.json();
        setIncomingRequests(data.requests || []);
      }
      if (labsRes.ok) {
        const data = await labsRes.json();
        setIncomingLabJoinRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Error loading incoming requests:', error);
    }
  };

  const loadDirectory = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const response = await fetch(`${API_BASE}/networking/directory`, { headers: authHeaders() });
      if (!response.ok) throw new Error('Failed to load directory');
      const data = await response.json();
      const mappedLabs: Lab[] = (data.labs || []).map((lab: any) => ({
        ...lab,
        isMember: Boolean(lab.isMember),
        isFollowing: Boolean(lab.isFollowing),
        membershipStatus: (lab.membershipStatus ||
          (lab.isMember ? 'member' : 'none')) as Lab['membershipStatus'],
        membershipRole: lab.membershipRole || null,
        joinRequestId: lab.joinRequestId || null,
        canLeave: Boolean(lab.canLeave),
        isOwnLab: Boolean(lab.isOwnLab),
        foundedYear: lab.foundedYear ?? null,
        matchScore: Number(lab.matchScore) || 0,
        matchReasons: Array.isArray(lab.matchReasons) ? lab.matchReasons : [],
      }));
      const mappedMembers: Member[] = (data.researchers || []).map((m: any) => ({
        ...m,
        isConnected: Boolean(m.isConnected),
        isFollowing: Boolean(m.isFollowing),
        connectionStatus: (m.connectionStatus || 'none') as Member['connectionStatus'],
        connectionDirection: m.connectionDirection || null,
        connectionId: m.connectionId || null,
        researchInterests: m.researchInterests || m.fieldsOfResearch || [],
        fieldsOfResearch: m.fieldsOfResearch || [],
        matchScore: Number(m.matchScore) || 0,
        matchReasons: Array.isArray(m.matchReasons) ? m.matchReasons : [],
      }));
      setLabs(mappedLabs);
      setMembers(mappedMembers);
      setMyLabs(data.myLabs || []);
      setViewerHasInterests(Boolean(data.viewerHasInterests));
      setFilterOptions(
        data.filterOptions || {
          countries: [],
          cities: [],
          fields: [],
          institutions: [],
          careerStages: [],
          lookingFor: [],
        }
      );
      await loadIncomingRequests();
    } catch (error) {
      console.error('Error loading networking directory:', error);
      setLabs([]);
      setMembers([]);
      setMyLabs([]);
    } finally {
      setLoading(false);
    }
  };

  const setFilter = <K extends keyof DirectoryFilters>(key: K, value: DirectoryFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const activeFilterCount = useMemo(
    () =>
      Object.entries(filters).filter(([key, value]) => {
        if (typeof value === 'boolean') return value;
        return Boolean(value);
      }).length,
    [filters]
  );

  const filteredLabs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const list = labs.filter((lab) => {
      if (filters.country && lab.country.toLowerCase() !== filters.country.toLowerCase()) return false;
      if (filters.city && lab.city.toLowerCase() !== filters.city.toLowerCase()) return false;
      if (filters.institution && lab.institution.toLowerCase() !== filters.institution.toLowerCase()) {
        return false;
      }
      if (filters.field && !matchField([lab.fieldOfResearch, lab.department, ...lab.researchAreas], filters.field)) {
        return false;
      }
      if (filters.lookingFor && !(lab.lookingFor || []).includes(filters.lookingFor)) return false;
      if (filters.hasWebsite && !lab.hasWebsite) return false;
      if (filters.sameInstitution && myInstitution && lab.institution.toLowerCase() !== myInstitution.toLowerCase()) {
        return false;
      }
      if (!q) return true;
      return (
        lab.name.toLowerCase().includes(q) ||
        lab.institution.toLowerCase().includes(q) ||
        lab.location.toLowerCase().includes(q) ||
        lab.department.toLowerCase().includes(q) ||
        lab.researchAreas.some((area) => area.toLowerCase().includes(q))
      );
    });
    return [...list].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  }, [labs, filters, searchQuery, myInstitution]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const list = members.filter((member) => {
      if (filters.country && member.country.toLowerCase() !== filters.country.toLowerCase()) return false;
      if (filters.city && member.city.toLowerCase() !== filters.city.toLowerCase()) return false;
      if (
        filters.institution &&
        member.institution.toLowerCase() !== filters.institution.toLowerCase()
      ) {
        return false;
      }
      if (filters.field && !matchField(member.fieldsOfResearch, filters.field)) return false;
      if (filters.careerStage && member.careerStage !== filters.careerStage) return false;
      if (filters.openToCollaborate && !member.openToCollaborate) return false;
      if (filters.recentlyActive && !member.recentlyActive) return false;
      if (filters.profileReady && member.profileCompleteness < 50) return false;
      if (filters.remoteFriendly && !member.hasRemoteSignal) return false;
      if (
        filters.sameInstitution &&
        myInstitution &&
        member.institution.toLowerCase() !== myInstitution.toLowerCase()
      ) {
        return false;
      }
      if (!q) return true;
      return (
        `${member.firstName} ${member.lastName}`.toLowerCase().includes(q) ||
        member.position.toLowerCase().includes(q) ||
        member.institution.toLowerCase().includes(q) ||
        member.location.toLowerCase().includes(q) ||
        member.researchInterests.some((interest) => interest.toLowerCase().includes(q)) ||
        (member.bio || '').toLowerCase().includes(q)
      );
    });
    return [...list].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  }, [members, filters, searchQuery, myInstitution]);

  const readError = async (response: Response, fallback: string) => {
    try {
      const data = await response.json();
      return data?.error || fallback;
    } catch {
      return fallback;
    }
  };

  const patchLab = (labId: string, patch: Partial<Lab>) => {
    setLabs((prev) => prev.map((lab) => (lab.id === labId ? { ...lab, ...patch } : lab)));
  };

  const handleLabAction = async (
    labId: string,
    action: 'join' | 'cancel-join' | 'leave' | 'follow' | 'unfollow'
  ) => {
    const previous = labs.find((l) => l.id === labId);
    if (!previous) return;

    if (action === 'leave') {
      const ok = window.confirm(
        `Leave ${previous.name}? You will lose access to its private workspace until you rejoin.`
      );
      if (!ok) return;
    }

    setActionBusyId(`lab:${labId}:${action}`);
    setActionError(null);

    // Optimistic UI
    if (action === 'join') {
      patchLab(labId, {
        membershipStatus: 'pending',
        isMember: false,
        joinRequestId: previous.joinRequestId || 'pending',
      });
    } else if (action === 'cancel-join') {
      patchLab(labId, {
        membershipStatus: 'none',
        isMember: false,
        joinRequestId: null,
      });
    } else if (action === 'leave') {
      patchLab(labId, {
        membershipStatus: 'none',
        isMember: false,
        canLeave: false,
        isOwnLab: false,
        membershipRole: null,
        joinRequestId: null,
        memberCount: Math.max(0, previous.memberCount - 1),
      });
    } else if (action === 'follow') {
      patchLab(labId, { isFollowing: true });
    } else if (action === 'unfollow') {
      patchLab(labId, { isFollowing: false });
    }

    try {
      let response: Response;
      if (action === 'follow') {
        response = await fetch(`${API_BASE}/networking/social/labs/${labId}/follow`, {
          method: 'POST',
          headers: authHeaders(),
        });
      } else if (action === 'unfollow') {
        response = await fetch(`${API_BASE}/networking/social/labs/${labId}/follow`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
      } else if (action === 'join') {
        response = await fetch(`${API_BASE}/networking/social/labs/${labId}/join-requests`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({}),
        });
      } else if (action === 'cancel-join') {
        response = await fetch(`${API_BASE}/networking/social/labs/${labId}/join-requests`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
      } else {
        response = await fetch(`${API_BASE}/networking/social/labs/${labId}/leave`, {
          method: 'POST',
          headers: authHeaders(),
        });
      }

      if (!response.ok) {
        throw new Error(await readError(response, `Could not ${action.replace('-', ' ')}`));
      }

      const data = await response.json();
      if (action === 'join' || action === 'cancel-join' || action === 'leave') {
        const status = (data.membershipStatus ||
          (data.isMember ? 'member' : action === 'join' ? 'pending' : 'none')) as Lab['membershipStatus'];
        patchLab(labId, {
          membershipStatus: status,
          isMember: status === 'member',
          joinRequestId: data.joinRequestId ?? (status === 'pending' ? previous.joinRequestId : null),
          canLeave: status === 'member' ? previous.canLeave : false,
          membershipRole: status === 'member' ? previous.membershipRole : null,
          isOwnLab: status === 'member' ? previous.isOwnLab : false,
          memberCount:
            action === 'leave'
              ? Math.max(0, previous.memberCount - 1)
              : previous.memberCount,
        });
      }
      if (action === 'follow' || action === 'unfollow') {
        patchLab(labId, { isFollowing: Boolean(data.isFollowing ?? action === 'follow') });
      }
    } catch (error: any) {
      console.error(`Error performing lab ${action}:`, error);
      setLabs((prev) => prev.map((l) => (l.id === labId ? previous : l)));
      setActionError(error?.message || `Failed to ${action}`);
    } finally {
      setActionBusyId(null);
    }
  };

  const handleMemberAction = async (
    memberId: string,
    action: 'connect' | 'disconnect' | 'follow' | 'unfollow'
  ) => {
    const previous = members.find((m) => m.id === memberId);
    if (!previous) return;

    if (action === 'disconnect' && previous.connectionStatus === 'connected') {
      const ok = window.confirm(
        `Disconnect from ${previous.firstName} ${previous.lastName}? You can send a new request later.`
      );
      if (!ok) return;
    }

    setActionBusyId(`user:${memberId}:${action}`);
    setActionError(null);

    setMembers((prevMembers) =>
      prevMembers.map((member) => {
        if (member.id !== memberId) return member;
        switch (action) {
          case 'connect':
            return {
              ...member,
              connectionStatus: 'pending' as const,
              connectionDirection: 'out' as const,
            };
          case 'disconnect':
            return {
              ...member,
              connectionStatus: 'none' as const,
              isConnected: false,
              connectionDirection: null,
              connectionId: null,
            };
          case 'follow':
            return { ...member, isFollowing: true };
          case 'unfollow':
            return { ...member, isFollowing: false };
          default:
            return member;
        }
      })
    );

    try {
      let response: Response;
      if (action === 'follow') {
        response = await fetch(`${API_BASE}/networking/social/follow/${memberId}`, {
          method: 'POST',
          headers: authHeaders(),
        });
      } else if (action === 'unfollow') {
        response = await fetch(`${API_BASE}/networking/social/follow/${memberId}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
      } else if (action === 'connect') {
        response = await fetch(`${API_BASE}/networking/social/connect/${memberId}`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({}),
        });
      } else {
        response = await fetch(`${API_BASE}/networking/social/connect/${memberId}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
      }

      if (!response.ok) {
        throw new Error(await readError(response, `Could not ${action}`));
      }

      const data = await response.json();
      if (action === 'connect' || action === 'disconnect') {
        setMembers((prev) =>
          prev.map((member) =>
            member.id === memberId
              ? {
                  ...member,
                  connectionStatus:
                    data.connectionStatus ||
                    (action === 'disconnect' ? 'none' : 'pending'),
                  isConnected: Boolean(data.isConnected),
                  connectionId:
                    action === 'disconnect' ? null : data.connectionId || member.connectionId,
                  connectionDirection:
                    data.connectionStatus === 'connected'
                      ? member.connectionDirection || 'out'
                      : data.connectionStatus === 'pending'
                        ? 'out'
                        : null,
                }
              : member
          )
        );
      }
      await loadIncomingRequests();
    } catch (error: any) {
      console.error(`Error performing ${action}:`, error);
      if (previous) {
        setMembers((prev) => prev.map((m) => (m.id === memberId ? previous : m)));
      }
      setActionError(error?.message || `Failed to ${action}`);
    } finally {
      setActionBusyId(null);
    }
  };

  const respondToRequest = async (request: IncomingRequest, status: 'accepted' | 'declined') => {
    setActionBusyId(`conn:${request.id}:${status}`);
    setActionError(null);
    try {
      const response = await fetch(
        `${API_BASE}/networking/social/connect/${request.id}/respond`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ status }),
        }
      );
      if (!response.ok) throw new Error(await readError(response, 'Failed to respond'));

      setIncomingRequests((prev) => prev.filter((r) => r.id !== request.id));
      setMembers((prev) =>
        prev.map((member) =>
          member.id === request.requesterId
            ? {
                ...member,
                isConnected: status === 'accepted',
                connectionStatus: status === 'accepted' ? 'connected' : 'none',
                connectionDirection: status === 'accepted' ? 'in' : null,
                connectionId: status === 'accepted' ? request.id : null,
              }
            : member
        )
      );
    } catch (error: any) {
      console.error('Error responding to connection request:', error);
      setActionError(error?.message || 'Failed to respond to connection request');
    } finally {
      setActionBusyId(null);
    }
  };

  const respondToLabJoinRequest = async (
    request: IncomingLabJoinRequest,
    status: 'accepted' | 'declined'
  ) => {
    setActionBusyId(`labjoin:${request.id}:${status}`);
    setActionError(null);
    try {
      const response = await fetch(
        `${API_BASE}/networking/social/labs/join-requests/${request.id}/respond`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ status }),
        }
      );
      if (!response.ok) throw new Error(await readError(response, 'Failed to respond'));

      setIncomingLabJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
      if (status === 'accepted') {
        setLabs((prev) =>
          prev.map((lab) =>
            lab.id === request.labId
              ? { ...lab, memberCount: lab.memberCount + 1 }
              : lab
          )
        );
      }
    } catch (error: any) {
      console.error('Error responding to lab join request:', error);
      setActionError(error?.message || 'Failed to respond to join request');
    } finally {
      setActionBusyId(null);
    }
  };

  const isBusy = (...keys: Array<string | null | undefined>) =>
    Boolean(actionBusyId && keys.some((key) => key && actionBusyId.startsWith(key)));

  const selectClass =
    'block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400';

  const renderLabCard = (lab: Lab) => {
    const membership = lab.membershipStatus || (lab.isMember ? 'member' : 'none');
    const busy = isBusy(`lab:${lab.id}`);

    return (
    <article
      key={lab.id}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-sky-50/30 shadow-sm transition-all hover:shadow-md hover:border-sky-200"
    >
      <div
        className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-600 to-cyan-500"
        aria-hidden="true"
      />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <BuildingOfficeIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-md border border-sky-100 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sky-800">
                {shortRef('LAB', lab.id)}
              </span>
              {membership === 'member' ? (
                <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                  {lab.isOwnLab ? 'Your lab' : 'Member'}
                </span>
              ) : null}
              {membership === 'pending' ? (
                <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  Requested
                </span>
              ) : null}
              {viewerHasInterests && (lab.matchScore || 0) > 0 ? (
                <span
                  className="rounded-md bg-sky-700 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  title="Ranked from your profile research interests"
                >
                  Match {Math.round(lab.matchScore || 0)}
                </span>
              ) : null}
            </div>
            <h3 className="line-clamp-2 text-[15px] font-semibold tracking-tight text-slate-900 transition-colors group-hover:text-sky-900">
              {lab.name}
            </h3>
            <p className="mt-0.5 line-clamp-1 text-[12px] text-slate-500">
              {[lab.institution, lab.location].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <p className="mb-3 line-clamp-2 text-[13px] leading-relaxed text-slate-600">
          {lab.tagline || lab.description || 'No description yet.'}
        </p>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {lab.researchAreas.slice(0, 3).map((area) => (
            <span
              key={area}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
            >
              {area}
            </span>
          ))}
          {(lab.lookingForLabels || []).slice(0, 1).map((label) => (
            <span
              key={label}
              className="rounded-md border border-amber-100 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900"
            >
              Looking: {label}
            </span>
          ))}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <UsersIcon className="h-3.5 w-3.5 text-sky-600" />
            {lab.memberCount} members
          </span>
          {(lab.city || lab.country) && (
            <span className="inline-flex items-center gap-1">
              <MapPinIcon className="h-3.5 w-3.5 text-sky-600" />
              {[lab.city, lab.country].filter(Boolean).join(', ')}
            </span>
          )}
          {lab.foundedYear ? <span>Est. {lab.foundedYear}</span> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-white/70 p-4 sm:p-5">
        {membership === 'member' ? (
          lab.canLeave ? (
            <Button
              onClick={() => handleLabAction(lab.id, 'leave')}
              variant="outline"
              className="!px-3 !py-1.5 text-xs"
              disabled={busy}
            >
              Leave
            </Button>
          ) : (
            <Button variant="outline" className="!px-3 !py-1.5 text-xs" disabled>
              {lab.isOwnLab ? 'Admin' : 'Member'}
            </Button>
          )
        ) : membership === 'pending' ? (
          <Button
            onClick={() => handleLabAction(lab.id, 'cancel-join')}
            variant="outline"
            className="!px-3 !py-1.5 text-xs"
            disabled={busy}
          >
            Cancel request
          </Button>
        ) : (
          <Button
            onClick={() => handleLabAction(lab.id, 'join')}
            variant="primary"
            className="!px-3 !py-1.5 text-xs"
            disabled={busy}
            title="Sends a request to lab admins. Membership starts after they accept."
          >
            Request to join
          </Button>
        )}
        <Button
          onClick={() => handleLabAction(lab.id, lab.isFollowing ? 'unfollow' : 'follow')}
          variant={lab.isFollowing ? 'ghost' : 'outline'}
          className="!px-3 !py-1.5 text-xs"
          disabled={busy}
          title={
            lab.isFollowing
              ? 'Stop following updates from this lab'
              : 'Follow without joining — one-way interest signal'
          }
        >
          <HeartIcon className={`mr-1.5 h-3.5 w-3.5 ${lab.isFollowing ? 'text-red-500' : ''}`} />
          {lab.isFollowing ? 'Following' : 'Follow'}
        </Button>
        <Link
          to={`/labs/${lab.id}`}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100 sm:flex-none"
        >
          <EyeIcon className="h-3.5 w-3.5" />
          Open
        </Link>
      </div>
    </article>
    );
  };

  const renderMemberCard = (member: Member) => {
    const pendingIn = member.connectionStatus === 'pending' && member.connectionDirection === 'in';
    const pendingOut = member.connectionStatus === 'pending' && !pendingIn;
    const connected = member.isConnected || member.connectionStatus === 'connected';
    const busy = isBusy(`user:${member.id}`, member.connectionId ? `conn:${member.connectionId}` : null);

    return (
      <article
        key={member.id}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-white to-sky-50/30 shadow-sm transition-all hover:shadow-md hover:border-sky-200"
      >
        <div
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-600 to-cyan-500"
          aria-hidden="true"
        />
        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <div className="mb-3 flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sky-100 bg-sky-50">
              {member.profilePicture ? (
                <img src={member.profilePicture} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserIcon className="h-6 w-6 text-sky-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-md border border-sky-100 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-sky-800">
                  {shortRef('RES', member.id)}
                </span>
                {connected ? (
                  <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                    Connected
                  </span>
                ) : null}
                {pendingOut ? (
                  <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                    Pending
                  </span>
                ) : null}
                {pendingIn ? (
                  <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                    Wants to connect
                  </span>
                ) : null}
                {member.openToCollaborate ? (
                  <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                    Open
                  </span>
                ) : null}
                {viewerHasInterests && (member.matchScore || 0) > 0 ? (
                  <span
                    className="rounded-md bg-sky-700 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    title="Ranked from your profile research interests"
                  >
                    Match {Math.round(member.matchScore || 0)}
                  </span>
                ) : null}
              </div>
              <h3 className="line-clamp-1 text-[15px] font-semibold tracking-tight text-slate-900 transition-colors group-hover:text-sky-900">
                {member.firstName} {member.lastName}
              </h3>
              <p className="mt-0.5 line-clamp-1 text-[12px] text-slate-500">
                {[member.position, member.institution].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>

          <p className="mb-3 line-clamp-2 text-[13px] leading-relaxed text-slate-600">
            {member.bio || 'No bio yet.'}
          </p>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {member.fieldsOfResearch.slice(0, 3).map((field) => (
              <span
                key={field}
                className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
              >
                {field}
              </span>
            ))}
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
            {member.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="h-3.5 w-3.5 text-sky-600" />
                {member.location}
              </span>
            ) : null}
            {member.careerStage && member.careerStage !== 'Unspecified' ? (
              <span className="inline-flex items-center gap-1">
                <AcademicCapIcon className="h-3.5 w-3.5 text-sky-600" />
                {member.careerStage}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-white/70 p-4 sm:p-5">
          {pendingIn ? (
            <>
              <Button
                onClick={() =>
                  member.connectionId &&
                  respondToRequest(
                    {
                      id: member.connectionId,
                      requesterId: member.id,
                      name: `${member.firstName} ${member.lastName}`,
                      position: member.position,
                      institution: member.institution,
                      createdAt: '',
                    },
                    'accepted'
                  )
                }
                variant="primary"
                className="!px-3 !py-1.5 text-xs"
                disabled={busy || !member.connectionId}
                title="Accept connection — becomes mutual"
              >
                <CheckIcon className="mr-1.5 h-3.5 w-3.5" />
                Accept
              </Button>
              <Button
                onClick={() =>
                  member.connectionId &&
                  respondToRequest(
                    {
                      id: member.connectionId,
                      requesterId: member.id,
                      name: `${member.firstName} ${member.lastName}`,
                      position: member.position,
                      institution: member.institution,
                      createdAt: '',
                    },
                    'declined'
                  )
                }
                variant="outline"
                className="!px-3 !py-1.5 text-xs"
                disabled={busy || !member.connectionId}
              >
                Decline
              </Button>
            </>
          ) : pendingOut ? (
            <Button
              variant="outline"
              className="!px-3 !py-1.5 text-xs"
              onClick={() => handleMemberAction(member.id, 'disconnect')}
              disabled={busy}
              title="Withdraw your pending connection request"
            >
              Cancel request
            </Button>
          ) : connected ? (
            <Button
              onClick={() => handleMemberAction(member.id, 'disconnect')}
              variant="outline"
              className="!px-3 !py-1.5 text-xs"
              disabled={busy}
              title="Remove mutual connection"
            >
              <UserMinusIcon className="mr-1.5 h-3.5 w-3.5" />
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={() => handleMemberAction(member.id, 'connect')}
              variant="primary"
              className="!px-3 !py-1.5 text-xs"
              disabled={busy}
              title="Send a mutual connection request. If they already requested you, this accepts it."
            >
              <UserPlusIcon className="mr-1.5 h-3.5 w-3.5" />
              Connect
            </Button>
          )}
          <Button
            onClick={() => handleMemberAction(member.id, member.isFollowing ? 'unfollow' : 'follow')}
            variant={member.isFollowing ? 'ghost' : 'outline'}
            className="!px-3 !py-1.5 text-xs"
            disabled={busy}
            title={
              member.isFollowing
                ? 'Stop following this researcher'
                : 'Follow without connecting — one-way interest'
            }
          >
            <HeartIcon className={`mr-1.5 h-3.5 w-3.5 ${member.isFollowing ? 'text-red-500' : ''}`} />
            {member.isFollowing ? 'Following' : 'Follow'}
          </Button>
          <Link
            to={`/profile/${member.id}`}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100 sm:flex-none"
          >
            <EyeIcon className="h-3.5 w-3.5" />
            Open
          </Link>
        </div>
      </article>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Networking"
        accent="sky"
        icon={<UsersIcon />}
        subtitle={
          <>
            Discover labs that chose to go live, and researchers by place, field, and collaboration
            intent
            {viewerHasInterests
              ? ' — ranked from your profile research interests'
              : (
                <>
                  . Add interests on your{' '}
                  <Link to="/profile" className="font-medium text-sky-800 underline-offset-2 hover:underline">
                    profile
                  </Link>{' '}
                  to unlock Match ranking
                </>
              )}
            . Private lab workspaces stay in{' '}
            <Link
              to="/lab-workspace"
              className="font-medium text-sky-900 hover:text-sky-950 underline-offset-2 hover:underline"
            >
              Lab workspace
            </Link>
            .
          </>
        }
      />

      <RecommendationsWidget
        itemType="collaborators"
        title="Suggested collaborators"
        limit={5}
        showFeedback={true}
        onItemClick={(itemId) => {
          // Prefer directory focus if available; otherwise stay on page
          const el = document.querySelector(`[data-user-id="${itemId}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowCollaboratorMatch((v) => !v)}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium rounded-md border transition-colors ${
            showCollaboratorMatch
              ? 'text-white bg-sky-700 border-sky-700 hover:bg-sky-800'
              : 'text-sky-900 bg-white border-sky-200 hover:bg-sky-50'
          }`}
        >
          <UsersIcon className="w-4 h-4" />
          Match collaborators
        </button>
        <Link
          to="/lab-workspace"
          className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-slate-800 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
        >
          <GlobeAltIcon className="w-4 h-4" />
          Your labs
          {myLabs.length > 0 ? (
            <span className="text-[11px] font-semibold text-slate-500">({myLabs.length})</span>
          ) : null}
        </Link>
      </div>

      {showCollaboratorMatch ? (
        <ProjectCollaboratorMatchPanel
          onSelectUser={(itemId) => {
            const el = document.querySelector(`[data-user-id="${itemId}"]`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
        />
      ) : null}

      {actionError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {actionError}
          <button
            type="button"
            className="ml-3 font-medium underline"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {incomingRequests.length > 0 && (
        <Card>
          <div className="p-5">
            <h2 className="mb-1 text-[15px] font-semibold text-slate-900">
              Connection requests ({incomingRequests.length})
            </h2>
            <p className="mb-3 text-[12px] text-slate-500">
              Accepting creates a mutual connection. Declining withdraws their request.
            </p>
            <ul className="space-y-3">
              {incomingRequests.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-col gap-3 rounded-lg border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-slate-900">{request.name}</p>
                    <p className="truncate text-[12px] text-slate-500">
                      {[request.position, request.institution].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="primary"
                      onClick={() => respondToRequest(request, 'accepted')}
                      disabled={isBusy(`conn:${request.id}`)}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => respondToRequest(request, 'declined')}
                      disabled={isBusy(`conn:${request.id}`)}
                    >
                      Decline
                    </Button>
                    <Link
                      to={`/profile/${request.requesterId}`}
                      className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      View
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {incomingLabJoinRequests.length > 0 && (
        <Card>
          <div className="p-5">
            <h2 className="mb-1 text-[15px] font-semibold text-slate-900">
              Lab join requests ({incomingLabJoinRequests.length})
            </h2>
            <p className="mb-3 text-[12px] text-slate-500">
              Accepting adds them as a researcher on your lab. They get workspace access.
            </p>
            <ul className="space-y-3">
              {incomingLabJoinRequests.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-col gap-3 rounded-lg border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-slate-900">{request.name}</p>
                    <p className="truncate text-[12px] text-slate-500">
                      Wants to join <span className="font-medium text-slate-700">{request.labName}</span>
                      {[request.position, request.institution].filter(Boolean).length
                        ? ` · ${[request.position, request.institution].filter(Boolean).join(' · ')}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="primary"
                      onClick={() => respondToLabJoinRequest(request, 'accepted')}
                      disabled={isBusy(`labjoin:${request.id}`)}
                    >
                      Accept
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => respondToLabJoinRequest(request, 'declined')}
                      disabled={isBusy(`labjoin:${request.id}`)}
                    >
                      Decline
                    </Button>
                    <Link
                      to={`/profile/${request.requesterId}`}
                      className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      View
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search labs and researchers…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setActiveFilter('all')}
              variant={activeFilter === 'all' ? 'primary' : 'outline'}
            >
              All
            </Button>
            <Button
              onClick={() => setActiveFilter('labs')}
              variant={activeFilter === 'labs' ? 'primary' : 'outline'}
              className="flex items-center"
            >
              <BuildingOfficeIcon className="w-4 h-4 mr-2" />
              Labs
            </Button>
            <Button
              onClick={() => setActiveFilter('members')}
              variant={activeFilter === 'members' ? 'primary' : 'outline'}
              className="flex items-center"
            >
              <UsersIcon className="w-4 h-4 mr-2" />
              Researchers
            </Button>
            <Button
              onClick={() => setShowFilters((v) => !v)}
              variant="outline"
              className="flex items-center"
            >
              <FunnelIcon className="w-4 h-4 mr-2" />
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block text-xs font-medium text-slate-600">
                Country
                <select
                  className={`${selectClass} mt-1`}
                  value={filters.country}
                  onChange={(e) => setFilter('country', e.target.value)}
                >
                  <option value="">Any country</option>
                  {filterOptions.countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                City
                <select
                  className={`${selectClass} mt-1`}
                  value={filters.city}
                  onChange={(e) => setFilter('city', e.target.value)}
                >
                  <option value="">Any city</option>
                  {filterOptions.cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Field of research
                <select
                  className={`${selectClass} mt-1`}
                  value={filters.field}
                  onChange={(e) => setFilter('field', e.target.value)}
                >
                  <option value="">Any field</option>
                  {filterOptions.fields.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Institution
                <select
                  className={`${selectClass} mt-1`}
                  value={filters.institution}
                  onChange={(e) => setFilter('institution', e.target.value)}
                >
                  <option value="">Any institution</option>
                  {filterOptions.institutions.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Career stage
                <select
                  className={`${selectClass} mt-1`}
                  value={filters.careerStage}
                  onChange={(e) => setFilter('careerStage', e.target.value)}
                >
                  <option value="">Any stage</option>
                  {filterOptions.careerStages.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Lab looking for
                <select
                  className={`${selectClass} mt-1`}
                  value={filters.lookingFor}
                  onChange={(e) => setFilter('lookingFor', e.target.value)}
                >
                  <option value="">Any intent</option>
                  {(filterOptions.lookingFor || []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.openToCollaborate}
                  onChange={(e) => setFilter('openToCollaborate', e.target.checked)}
                  className="rounded border-slate-300"
                />
                Open to collaborate
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.recentlyActive}
                  onChange={(e) => setFilter('recentlyActive', e.target.checked)}
                  className="rounded border-slate-300"
                />
                Recently active (30d)
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.profileReady}
                  onChange={(e) => setFilter('profileReady', e.target.checked)}
                  className="rounded border-slate-300"
                />
                Profile ≥50% complete
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.remoteFriendly}
                  onChange={(e) => setFilter('remoteFriendly', e.target.checked)}
                  className="rounded border-slate-300"
                />
                Remote-ready (timezone set)
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.hasWebsite}
                  onChange={(e) => setFilter('hasWebsite', e.target.checked)}
                  className="rounded border-slate-300"
                />
                Lab has website
              </label>
              {myInstitution && (
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.sameInstitution}
                    onChange={(e) => setFilter('sameInstitution', e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Same institution as me
                </label>
              )}
            </div>

            {activeFilterCount > 0 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
                >
                  <XMarkIcon className="w-4 h-4" />
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-8">
        {(activeFilter === 'all' || activeFilter === 'labs') && (
          <div>
            <div className="mb-3.5 flex items-center justify-between">
              <h2 className="flex items-center text-[15px] font-semibold text-slate-900">
                <BuildingOfficeIcon className="mr-2 h-5 w-5 text-sky-600" />
                Research labs
                <span className="ml-2 text-[13px] font-normal text-slate-500">
                  ({filteredLabs.length})
                </span>
              </h2>
            </div>
            {filteredLabs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-sky-200 bg-gradient-to-br from-sky-50/60 via-white to-cyan-50/40 px-6 py-14 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <BuildingOfficeIcon className="h-6 w-6" />
                </div>
                <h3 className="mb-1 text-sm font-semibold text-slate-900">
                  {labs.length === 0 ? 'No labs to show yet' : 'No labs match your filters'}
                </h3>
                <p className="mx-auto max-w-md text-sm text-slate-500">
                  {labs.length === 0
                    ? 'Only labs that opt in appear here. Create a lab in Lab workspace, then use Showcase on Networking.'
                    : 'Try clearing a filter or broadening your search.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                {filteredLabs.map(renderLabCard)}
              </div>
            )}
          </div>
        )}

        {(activeFilter === 'all' || activeFilter === 'members') && (
          <div>
            <div className="mb-3.5 flex items-center justify-between">
              <h2 className="flex items-center text-[15px] font-semibold text-slate-900">
                <UsersIcon className="mr-2 h-5 w-5 text-sky-600" />
                Researchers
                <span className="ml-2 text-[13px] font-normal text-slate-500">
                  ({filteredMembers.length})
                </span>
              </h2>
            </div>
            {filteredMembers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-sky-200 bg-gradient-to-br from-sky-50/60 via-white to-cyan-50/40 px-6 py-14 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <UsersIcon className="h-6 w-6" />
                </div>
                <h3 className="mb-1 text-sm font-semibold text-slate-900">
                  {members.length === 0
                    ? 'No researchers in the directory yet'
                    : 'No researchers match your filters'}
                </h3>
                <p className="mx-auto max-w-md text-sm text-slate-500">
                  {members.length === 0
                    ? 'Profiles with public visibility show up here. Update location and field on Settings to be discoverable.'
                    : 'Try clearing a filter or broadening your search.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                {filteredMembers.map(renderMemberCard)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LinkedInStyleNetworking;
