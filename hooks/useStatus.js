'use client';
import { useState, useEffect, useCallback } from 'react';

export function useStatus(intervalMs = 30000) {
  const [statuses, setStatuses]     = useState([]);
  const [summary, setSummary]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError]           = useState(null);

  const fetch_ = useCallback(async (forceRefresh = false) => {
    try {
      const url = forceRefresh ? '/api/status?refresh=true' : '/api/status';
      const res = await fetch(url);
      const json = await res.json();
      if (json.status === 'success') {
        setStatuses(json.data.apis || []);
        setSummary(json.data.summary || null);
        setLastUpdated(new Date());
        setError(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(() => fetch_(), intervalMs);
    return () => clearInterval(id);
  }, [fetch_, intervalMs]);

  return { statuses, summary, loading, lastUpdated, error, refresh: () => fetch_(true) };
}

export function useErrorLog() {
  const [logs, setLogs]     = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/health?mode=errors');
      const json = await res.json();
      if (json.status === 'success') setLogs(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);

  return { logs, loading, refresh: load };
}

export function useUptime(apiId) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiId) return;
    (async () => {
      try {
        const res = await fetch(`/api/health?mode=history&id=${apiId}`);
        const json = await res.json();
        if (json.status === 'success') setData(json.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [apiId]);

  return { data, loading };
}
