import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

interface Policy {
  id: string;
  type: string;
  title: string;
  content: string;
  version: string;
  effective_date: string;
  language: string;
}

const fallbackPolicy: Policy = {
  id: 'fallback-terms',
  type: 'terms',
  title: 'Terms of Service',
  version: 'draft',
  effective_date: new Date().toISOString(),
  language: 'en',
  content: `By creating an account or using RILOS (Research Intelligence & Operating System), you agree to these Terms and our Privacy Policy.

Use the platform only for lawful research and collaboration. Keep your credentials confidential.

You retain rights in content you create, subject to lab/institution policies. Contact your administrator with questions.`
};

const resolveApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isLocalhost) {
      return `http://localhost:${import.meta.env.VITE_API_PORT || '5002'}/api`;
    }
    return `${window.location.origin}/api`;
  }
  return 'http://localhost:5002/api';
};

const TermsOfServicePage: React.FC = () => {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const apiBaseUrl = useMemo(() => resolveApiBaseUrl(), []);

  useEffect(() => {
    const loadPolicy = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${apiBaseUrl}/compliance/policies/terms`);
        if (!response.ok) {
          setPolicy(fallbackPolicy);
          return;
        }
        const data = await response.json();
        setPolicy(data?.policy || fallbackPolicy);
      } catch {
        setPolicy(fallbackPolicy);
      } finally {
        setLoading(false);
      }
    };
    loadPolicy();
  }, [apiBaseUrl]);

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-4xl rounded-xl border border-gray-100 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Terms of Service</h1>
        {loading ? (
          <p className="mt-4 text-gray-500">Loading…</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-gray-500">
              Version {policy?.version} · Effective {policy?.effective_date
                ? new Date(policy.effective_date).toLocaleDateString()
                : 'n/a'}
            </p>
            <div className="prose mt-6 max-w-none whitespace-pre-wrap text-gray-800">
              {policy?.content}
            </div>
            <p className="mt-8 text-sm text-gray-500">
              <Link to="/privacy" className="text-indigo-600 hover:underline">Privacy</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default TermsOfServicePage;
