/**
 * Marketplace directory - suppliers, service providers & tenders.
 * Contact via email only; no deals, bookings, or checkout.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { getAuthHeaders, getAuthToken, resolveApiBaseUrl, formatApiNetworkError } from '../utils/apiBase';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import SupplierRegisterForm, {
  SupplierRegisterValues,
} from '../components/SupplierRegisterForm';
import ServiceProviderRegisterForm, {
  ServiceProviderRegisterValues,
} from '../components/ServiceProviderRegisterForm';
import TenderPostForm, { TenderPostValues } from '../components/TenderPostForm';
import PostedBy from '../components/PostedBy';
import {
  SearchIcon,
  BriefcaseIcon,
  PackageIcon,
  MapPinIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  XMarkIcon,
  BuildingOfficeIcon,
  DocumentTextIcon,
} from '../components/icons';
import { PageHeader } from '../components/PageHeader';

const API_BASE = resolveApiBaseUrl();

const authHeaders = () => ({
  Authorization: `Bearer ${getAuthToken() || ''}`,
});

type Supplier = {
  id: string;
  company_name: string;
  contact_email: string;
  contact_phone?: string;
  website?: string;
  location?: string;
  country?: string;
  description?: string;
  specializations: string[];
  verified?: boolean;
  owner_name?: string;
  postedByName?: string;
};

type CatalogItem = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  pricing_note?: string;
};

type Provider = {
  id: string;
  display_name: string;
  contact_email: string;
  contact_phone?: string;
  website?: string;
  institution?: string;
  location?: string;
  bio?: string;
  expertise_areas: string[];
  techniques: string[];
  pricing_note?: string;
  verified?: boolean;
  owner_name?: string;
  postedByName?: string;
  matchScore?: number;
  matchReasons?: string[];
};

type Offering = {
  id: string;
  title: string;
  description?: string;
  service_type?: string;
  turnaround_note?: string;
  pricing_note?: string;
};

type Tender = {
  id: string;
  title: string;
  organization?: string;
  contact_email: string;
  contact_phone?: string;
  location?: string;
  country?: string;
  description?: string;
  category?: string;
  budget_note?: string;
  deadline?: string | null;
  requirements: string[];
  user_id?: string;
  owner_name?: string;
  postedByName?: string;
};

type MarketplaceTab = 'suppliers' | 'services' | 'tenders';

const mailto = (email: string, subject: string) =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}`;

const MarketplacePage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<MarketplaceTab>(() => {
    const tab = searchParams.get('tab');
    if (tab === 'services' || tab === 'tenders') return tab;
    return 'suppliers';
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [viewerHasInterests, setViewerHasInterests] = useState(false);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [mySupplierId, setMySupplierId] = useState<string | null>(null);
  const [myProviderId, setMyProviderId] = useState<string | null>(null);
  const [myTenderIds, setMyTenderIds] = useState<Set<string>>(new Set());
  const [showSupplierRegister, setShowSupplierRegister] = useState(false);
  const [showProviderRegister, setShowProviderRegister] = useState(false);
  const [showTenderPost, setShowTenderPost] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [detailSupplier, setDetailSupplier] = useState<{
    supplier: Supplier;
    catalog: CatalogItem[];
  } | null>(null);
  const [detailProvider, setDetailProvider] = useState<{
    provider: Provider;
    offerings: Offering[];
  } | null>(null);
  const [detailTender, setDetailTender] = useState<Tender | null>(null);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'services' || tab === 'suppliers' || tab === 'tenders') setActiveTab(tab);
  }, [searchParams]);

  const switchTab = (tab: MarketplaceTab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    next.delete('view');
    setSearchParams(next);
    setDetailSupplier(null);
    setDetailProvider(null);
    setDetailTender(null);
  };

  const loadDirectory = async () => {
    setLoading(true);
    try {
      const headers = authHeaders();
      if (activeTab === 'suppliers') {
        const res = await axios.get(`${API_BASE}/marketplace/suppliers`, {
          headers,
          params: searchTerm ? { search: searchTerm } : undefined,
        });
        setSuppliers(res.data.suppliers || []);
      } else if (activeTab === 'services') {
        const res = await axios.get(`${API_BASE}/marketplace/service-providers`, {
          headers,
          params: searchTerm ? { search: searchTerm } : undefined,
        });
        setProviders(res.data.providers || []);
        setViewerHasInterests(Boolean(res.data.viewerHasInterests));
      } else {
        const res = await axios.get(`${API_BASE}/marketplace/tenders`, {
          headers,
          params: searchTerm ? { search: searchTerm } : undefined,
        });
        setTenders(res.data.tenders || []);
      }
    } catch (error) {
      console.error('Failed to load marketplace directory:', error);
      if (activeTab === 'suppliers') setSuppliers([]);
      else if (activeTab === 'services') setProviders([]);
      else setTenders([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMyProfiles = async () => {
    try {
      const headers = authHeaders();
      const [s, p, t] = await Promise.all([
        axios.get(`${API_BASE}/marketplace/suppliers/me`, { headers }).catch(() => null),
        axios
          .get(`${API_BASE}/marketplace/service-providers/me`, { headers })
          .catch(() => null),
        axios.get(`${API_BASE}/marketplace/tenders/mine`, { headers }).catch(() => null),
      ]);
      setMySupplierId(s?.data?.supplier?.id || null);
      setMyProviderId(p?.data?.provider?.id || null);
      setMyTenderIds(
        new Set((t?.data?.tenders || []).map((row: Tender) => row.id).filter(Boolean))
      );
    } catch {
      /* ignore */
    }
  };
  const removeMySupplier = async () => {
    if (!confirm('Remove your supplier listing from the marketplace?')) return;
    try {
      await axios.delete(`${API_BASE}/marketplace/suppliers/me`, { headers: authHeaders() });
      setMySupplierId(null);
      await loadDirectory();
    } catch (e) {
      console.error(e);
      alert('Could not remove supplier listing');
    }
  };

  const removeMyProvider = async () => {
    if (!confirm('Remove your service provider listing from the marketplace?')) return;
    try {
      await axios.delete(`${API_BASE}/marketplace/service-providers/me`, {
        headers: authHeaders(),
      });
      setMyProviderId(null);
      await loadDirectory();
    } catch (e) {
      console.error(e);
      alert('Could not remove provider listing');
    }
  };

  const removeMyTender = async (id: string) => {
    if (!confirm('Remove this tender from the marketplace?')) return;
    try {
      await axios.delete(`${API_BASE}/marketplace/tenders/${id}`, {
        headers: authHeaders(),
      });
      setMyTenderIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (detailTender?.id === id) setDetailTender(null);
      await loadDirectory();
      await loadMyProfiles();
    } catch (e) {
      console.error(e);
      alert('Could not remove tender');
    }
  };

  useEffect(() => {
    loadDirectory();
  }, [activeTab]);

  useEffect(() => {
    loadMyProfiles();
  }, []);

  useEffect(() => {
    const viewId = searchParams.get('view');
    if (!viewId) return;
    if (activeTab === 'suppliers') openSupplier(viewId);
    else if (activeTab === 'services') openProvider(viewId);
    else openTender(viewId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('view'), activeTab]);

  const openSupplier = async (id: string) => {
    try {
      const res = await axios.get(`${API_BASE}/marketplace/suppliers/${id}`, {
        headers: authHeaders(),
      });
      setDetailSupplier({
        supplier: res.data.supplier,
        catalog: res.data.catalog || [],
      });
    } catch (error: any) {
      alert(error.response?.data?.error || 'Could not load supplier');
    }
  };

  const openProvider = async (id: string) => {
    try {
      const res = await axios.get(`${API_BASE}/marketplace/service-providers/${id}`, {
        headers: authHeaders(),
      });
      setDetailProvider({
        provider: res.data.provider,
        offerings: res.data.offerings || [],
      });
    } catch (error: any) {
      alert(error.response?.data?.error || 'Could not load service provider');
    }
  };

  const openTender = async (id: string) => {
    try {
      const res = await axios.get(`${API_BASE}/marketplace/tenders/${id}`, {
        headers: authHeaders(),
      });
      setDetailTender(res.data.tender);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Could not load tender');
    }
  };

  const handleSupplierRegister = async (data: SupplierRegisterValues) => {
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/marketplace/suppliers/register`, data, {
        headers: authHeaders(),
      });
      setShowSupplierRegister(false);
      await loadMyProfiles();
      await loadDirectory();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProviderRegister = async (data: ServiceProviderRegisterValues) => {
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/marketplace/service-providers/register`, data, {
        headers: authHeaders(),
      });
      setShowProviderRegister(false);
      await loadMyProfiles();
      await loadDirectory();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTenderPost = async (data: TenderPostValues) => {
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE}/marketplace/tenders`, data, {
        headers: authHeaders(),
      });
      setShowTenderPost(false);
      await loadMyProfiles();
      await loadDirectory();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Could not post tender');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSuppliers = useMemo(() => {
    if (!searchTerm.trim()) return suppliers;
    const q = searchTerm.toLowerCase();
    return suppliers.filter(
      (s) =>
        s.company_name.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.location?.toLowerCase().includes(q) ||
        s.specializations?.some((x) => x.toLowerCase().includes(q))
    );
  }, [suppliers, searchTerm]);

  const filteredProviders = useMemo(() => {
    const list = !searchTerm.trim()
      ? providers
      : providers.filter(
          (p) =>
            p.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.bio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.institution?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.expertise_areas?.some((x) => x.toLowerCase().includes(searchTerm.toLowerCase())) ||
            p.techniques?.some((x) => x.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    return [...list].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
  }, [providers, searchTerm]);

  const filteredTenders = useMemo(() => {
    if (!searchTerm.trim()) return tenders;
    const q = searchTerm.toLowerCase();
    return tenders.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.organization?.toLowerCase().includes(q) ||
        t.location?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        t.requirements?.some((x) => x.toLowerCase().includes(q))
    );
  }, [tenders, searchTerm]);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8 space-y-4">
        <PageHeader
          title="Marketplace"
          accent="emerald"
          icon={<BriefcaseIcon />}
          subtitle="Research supplies, expertise, and tenders directory. Contact by email — no deals on this platform."
          actions={
            <>
              {activeTab === 'suppliers' ? (
                mySupplierId ? (
                  <>
                    <Link
                      to="/marketplace/supplier"
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-emerald-900 bg-white/90 border border-emerald-200 rounded-md hover:bg-emerald-50"
                    >
                      My supplier workspace
                    </Link>
                    <button
                      type="button"
                      onClick={() => void removeMySupplier()}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                    >
                      Remove listing
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSupplierRegister(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800"
                  >
                    Register as supplier
                  </button>
                )
              ) : activeTab === 'services' ? (
                myProviderId ? (
                  <>
                    <Link
                      to="/marketplace/provider"
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-emerald-900 bg-white/90 border border-emerald-200 rounded-md hover:bg-emerald-50"
                    >
                      My provider workspace
                    </Link>
                    <button
                      type="button"
                      onClick={() => void removeMyProvider()}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                    >
                      Remove listing
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowProviderRegister(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800"
                  >
                    Register as service provider
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTenderPost(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium text-white bg-emerald-700 rounded-md hover:bg-emerald-800"
                >
                  Post a tender
                </button>
              )}
            </>
          }
        >
          <div className="flex gap-1 border-b border-emerald-200/70">
            <button
              type="button"
              onClick={() => switchTab('suppliers')}
              className={`relative px-3.5 py-2 text-[13px] font-medium transition-colors ${
                activeTab === 'suppliers' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Suppliers
              {activeTab === 'suppliers' && (
                <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-emerald-600 rounded-full" />
              )}
            </button>
            <button
              type="button"
              onClick={() => switchTab('services')}
              className={`relative px-3.5 py-2 text-[13px] font-medium transition-colors ${
                activeTab === 'services' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Services
              {activeTab === 'services' && (
                <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-emerald-600 rounded-full" />
              )}
            </button>
            <button
              type="button"
              onClick={() => switchTab('tenders')}
              className={`relative px-3.5 py-2 text-[13px] font-medium transition-colors ${
                activeTab === 'tenders' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Tenders
              {activeTab === 'tenders' && (
                <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-emerald-600 rounded-full" />
              )}
            </button>
          </div>
        </PageHeader>
      </div>

      <div className="bg-gradient-to-br from-emerald-50/50 to-white rounded-xl border border-emerald-100/80 p-4 mb-6 shadow-sm">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadDirectory()}
            placeholder={
              activeTab === 'suppliers'
                ? 'Search suppliers by name, location, or specialty…'
                : activeTab === 'services'
                  ? 'Search providers by name, expertise, or technique…'
                  : 'Search tenders by title, organization, or category…'
            }
            className="w-full pl-10 pr-4 py-2.5 text-[14px] border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-[13px] text-slate-500">Loading directory…</div>
      ) : activeTab === 'suppliers' ? (
        filteredSuppliers.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-xl py-14 text-center px-6">
            <BuildingOfficeIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-[15px] font-semibold text-slate-900 mb-1">No suppliers listed yet</h3>
            <p className="text-[13px] text-slate-500 mb-5">
              Be the first to register your company in the supplies directory.
            </p>
            {!mySupplierId && (
              <button
                type="button"
                onClick={() => setShowSupplierRegister(true)}
                className="inline-flex items-center px-3.5 py-2 text-[13px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
              >
                Register as supplier
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSuppliers.map((supplier) => (
              <div
                key={supplier.id}
                className="bg-white border border-slate-200/80 rounded-xl p-5 flex flex-col"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-[15px] font-semibold text-slate-900">{supplier.company_name}</h3>
                  {supplier.verified && (
                    <CheckCircleIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  )}
                </div>
                {(supplier.location || supplier.country) && (
                  <p className="text-[12px] text-slate-500 inline-flex items-center gap-1 mb-2">
                    <MapPinIcon className="w-3.5 h-3.5" />
                    {[supplier.location, supplier.country].filter(Boolean).join(', ')}
                  </p>
                )}
                <p className="text-[13px] text-slate-600 line-clamp-3 flex-1">
                  {supplier.description || 'Research supplies directory listing.'}
                </p>
                <PostedBy
                  name={supplier.postedByName || supplier.owner_name}
                  className="mt-2"
                />
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(supplier.specializations || []).slice(0, 4).map((spec) => (
                    <span
                      key={spec}
                      className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px]"
                    >
                      {spec}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openSupplier(supplier.id)}
                    className="flex-1 px-3 py-2 text-[13px] font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    View details
                  </button>
                  <a
                    href={mailto(
                      supplier.contact_email,
                      `Inquiry via RILOS - ${supplier.company_name}`
                    )}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
                  >
                    <EnvelopeIcon className="w-4 h-4" />
                    Contact
                  </a>
                </div>
              </div>
            ))}
          </div>
        )
      ) : activeTab === 'services' ? (
        filteredProviders.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-xl py-14 text-center px-6">
            <BriefcaseIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-[15px] font-semibold text-slate-900 mb-1">
              No service providers listed yet
            </h3>
            <p className="text-[13px] text-slate-500 mb-5">
              Register to offer research expertise in the directory.
            </p>
            {!myProviderId && (
              <button
                type="button"
                onClick={() => setShowProviderRegister(true)}
                className="inline-flex items-center px-3.5 py-2 text-[13px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
              >
                Register as service provider
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProviders.map((provider) => (
              <div
                key={provider.id}
                className="bg-white border border-slate-200/80 rounded-xl p-5 flex flex-col"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-[15px] font-semibold text-slate-900">
                    {provider.display_name}
                  </h3>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {viewerHasInterests && (provider.matchScore || 0) > 0 ? (
                      <span
                        className="rounded-md bg-emerald-700 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        title="Ranked from your profile research interests"
                      >
                        Match {Math.round(provider.matchScore || 0)}
                      </span>
                    ) : null}
                    {provider.verified && (
                      <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
                    )}
                  </div>
                </div>
                {(provider.institution || provider.location) && (
                  <p className="text-[12px] text-slate-500 mb-2">
                    {[provider.institution, provider.location].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="text-[13px] text-slate-600 line-clamp-3 flex-1">
                  {provider.bio || 'Research service provider.'}
                </p>
                <PostedBy
                  name={provider.postedByName || provider.owner_name}
                  className="mt-2"
                />
                {provider.pricing_note && (
                  <p className="mt-2 text-[12px] text-slate-500">{provider.pricing_note}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(provider.expertise_areas || []).slice(0, 4).map((area) => (
                    <span
                      key={area}
                      className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px]"
                    >
                      {area}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openProvider(provider.id)}
                    className="flex-1 px-3 py-2 text-[13px] font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    View details
                  </button>
                  <a
                    href={mailto(
                      provider.contact_email,
                      `Inquiry via RILOS - ${provider.display_name}`
                    )}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
                  >
                    <EnvelopeIcon className="w-4 h-4" />
                    Contact
                  </a>
                </div>
              </div>
            ))}
          </div>
        )
      ) : filteredTenders.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-xl py-14 text-center px-6">
          <DocumentTextIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-[15px] font-semibold text-slate-900 mb-1">No tenders posted yet</h3>
          <p className="text-[13px] text-slate-500 mb-5">
            Post a research procurement notice or RFP for suppliers and providers to respond to.
          </p>
          <button
            type="button"
            onClick={() => setShowTenderPost(true)}
            className="inline-flex items-center px-3.5 py-2 text-[13px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
          >
            Post a tender
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTenders.map((tender) => (
            <div
              key={tender.id}
              className="bg-white border border-slate-200/80 rounded-xl p-5 flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-[15px] font-semibold text-slate-900">{tender.title}</h3>
                {tender.category && (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] flex-shrink-0">
                    {tender.category}
                  </span>
                )}
              </div>
              {tender.organization && (
                <p className="text-[12px] text-slate-500 mb-1">{tender.organization}</p>
              )}
              {(tender.location || tender.country) && (
                <p className="text-[12px] text-slate-500 inline-flex items-center gap-1 mb-2">
                  <MapPinIcon className="w-3.5 h-3.5" />
                  {[tender.location, tender.country].filter(Boolean).join(', ')}
                </p>
              )}
              <p className="text-[13px] text-slate-600 line-clamp-3 flex-1">
                {tender.description || 'Research tender / RFP.'}
              </p>
              <PostedBy name={tender.postedByName || tender.owner_name} className="mt-2" />
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-slate-500">
                {tender.deadline && <span>Deadline: {tender.deadline}</span>}
                {tender.budget_note && <span>{tender.budget_note}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {(tender.requirements || []).slice(0, 4).map((req) => (
                  <span
                    key={req}
                    className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px]"
                  >
                    {req}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => openTender(tender.id)}
                  className="flex-1 px-3 py-2 text-[13px] font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  View details
                </button>
                {myTenderIds.has(tender.id) ? (
                  <button
                    type="button"
                    onClick={() => void removeMyTender(tender.id)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                  >
                    Remove
                  </button>
                ) : (
                  <a
                    href={mailto(
                      tender.contact_email,
                      `Tender response via RILOS - ${tender.title}`
                    )}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
                  >
                    <EnvelopeIcon className="w-4 h-4" />
                    Respond
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {detailSupplier && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {detailSupplier.supplier.company_name}
                </h2>
                {(detailSupplier.supplier.location || detailSupplier.supplier.country) && (
                  <p className="mt-1 text-[13px] text-slate-500">
                    {[detailSupplier.supplier.location, detailSupplier.supplier.country]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailSupplier(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {detailSupplier.supplier.description && (
                <p className="text-[14px] text-slate-600 leading-relaxed">
                  {detailSupplier.supplier.description}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {(detailSupplier.supplier.specializations || []).map((s) => (
                  <span
                    key={s}
                    className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px]"
                  >
                    {s}
                  </span>
                ))}
              </div>
              {detailSupplier.catalog.length > 0 && (
                <div>
                  <h3 className="text-[13px] font-semibold text-slate-900 mb-2">Catalog</h3>
                  <ul className="space-y-2">
                    {detailSupplier.catalog.map((item) => (
                      <li
                        key={item.id}
                        className="border border-slate-100 rounded-lg px-3 py-2"
                      >
                        <p className="text-[13px] font-medium text-slate-900">{item.name}</p>
                        {item.description && (
                          <p className="text-[12px] text-slate-500 mt-0.5">{item.description}</p>
                        )}
                        {(item.category || item.pricing_note) && (
                          <p className="text-[11px] text-slate-500 mt-1">
                            {[item.category, item.pricing_note].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <a
                href={mailto(
                  detailSupplier.supplier.contact_email,
                  `Inquiry via RILOS - ${detailSupplier.supplier.company_name}`
                )}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
              >
                <EnvelopeIcon className="w-4 h-4" />
                Email {detailSupplier.supplier.contact_email}
              </a>
            </div>
          </div>
        </div>
      )}

      {detailProvider && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {detailProvider.provider.display_name}
                </h2>
                {(detailProvider.provider.institution || detailProvider.provider.location) && (
                  <p className="mt-1 text-[13px] text-slate-500">
                    {[detailProvider.provider.institution, detailProvider.provider.location]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailProvider(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {detailProvider.provider.bio && (
                <p className="text-[14px] text-slate-600 leading-relaxed">
                  {detailProvider.provider.bio}
                </p>
              )}
              {detailProvider.provider.pricing_note && (
                <p className="text-[13px] text-slate-500">{detailProvider.provider.pricing_note}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {[
                  ...(detailProvider.provider.expertise_areas || []),
                  ...(detailProvider.provider.techniques || []),
                ].map((s) => (
                  <span
                    key={s}
                    className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px]"
                  >
                    {s}
                  </span>
                ))}
              </div>
              {detailProvider.offerings.length > 0 && (
                <div>
                  <h3 className="text-[13px] font-semibold text-slate-900 mb-2">Offerings</h3>
                  <ul className="space-y-2">
                    {detailProvider.offerings.map((item) => (
                      <li
                        key={item.id}
                        className="border border-slate-100 rounded-lg px-3 py-2"
                      >
                        <p className="text-[13px] font-medium text-slate-900">{item.title}</p>
                        {item.description && (
                          <p className="text-[12px] text-slate-500 mt-0.5">{item.description}</p>
                        )}
                        <p className="text-[11px] text-slate-500 mt-1">
                          {[
                            item.service_type?.replace(/_/g, ' '),
                            item.turnaround_note,
                            item.pricing_note,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <a
                href={mailto(
                  detailProvider.provider.contact_email,
                  `Inquiry via RILOS - ${detailProvider.provider.display_name}`
                )}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
              >
                <EnvelopeIcon className="w-4 h-4" />
                Email {detailProvider.provider.contact_email}
              </a>
            </div>
          </div>
        </div>
      )}

      {detailTender && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{detailTender.title}</h2>
                {detailTender.organization && (
                  <p className="mt-1 text-[13px] text-slate-500">{detailTender.organization}</p>
                )}
                {(detailTender.location || detailTender.country) && (
                  <p className="mt-1 text-[13px] text-slate-500">
                    {[detailTender.location, detailTender.country].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailTender(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {detailTender.description && (
                <p className="text-[14px] text-slate-600 leading-relaxed">
                  {detailTender.description}
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-500">
                {detailTender.category && <span>Category: {detailTender.category}</span>}
                {detailTender.deadline && <span>Deadline: {detailTender.deadline}</span>}
                {detailTender.budget_note && <span>{detailTender.budget_note}</span>}
              </div>
              {(detailTender.requirements || []).length > 0 && (
                <div>
                  <h3 className="text-[13px] font-semibold text-slate-900 mb-2">Requirements</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {detailTender.requirements.map((r) => (
                      <span
                        key={r}
                        className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px]"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <PostedBy name={detailTender.postedByName || detailTender.owner_name} />
              {myTenderIds.has(detailTender.id) ? (
                <button
                  type="button"
                  onClick={() => void removeMyTender(detailTender.id)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50"
                >
                  Remove tender
                </button>
              ) : (
                <a
                  href={mailto(
                    detailTender.contact_email,
                    `Tender response via RILOS - ${detailTender.title}`
                  )}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
                >
                  <EnvelopeIcon className="w-4 h-4" />
                  Email {detailTender.contact_email}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {showSupplierRegister && (
        <SupplierRegisterForm
          initialData={{ contact_email: user?.email || '' }}
          onSubmit={handleSupplierRegister}
          onCancel={() => setShowSupplierRegister(false)}
          isSubmitting={submitting}
        />
      )}

      {showProviderRegister && (
        <ServiceProviderRegisterForm
          initialData={{
            display_name:
              user?.first_name && user?.last_name
                ? `${user.first_name} ${user.last_name}`
                : user?.username || '',
            contact_email: user?.email || '',
          }}
          onSubmit={handleProviderRegister}
          onCancel={() => setShowProviderRegister(false)}
          isSubmitting={submitting}
        />
      )}

      {showTenderPost && (
        <TenderPostForm
          initialData={{ contact_email: user?.email || '' }}
          onSubmit={handleTenderPost}
          onCancel={() => setShowTenderPost(false)}
          isSubmitting={submitting}
        />
      )}
    </div>
  );
};

export default MarketplacePage;
