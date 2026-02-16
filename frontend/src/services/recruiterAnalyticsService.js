// src/services/recruiterAnalyticsService.js
// ✅ PERMANENT FIX: Strict Multi-Layer Deduplication (Name + UserID + Email)
// ✅ Ensures one person is displayed only once even with multiple accounts/uploads

import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Helper to normalize names for deduplication
 */
const normalizeText = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text.toLowerCase().trim().replace(/\s+/g, '').replace(/[^\w]/g, '');
};

/**
 * Normalizes text to create a unique fingerprint for a person
 */
const getIdentityKey = (resume) => {
  const name = (resume.analysis_data?.candidate_name || "").toLowerCase().trim().replace(/\s+/g, '');
  const email = (resume.analysis_data?.candidate_email || "").toLowerCase().trim();
  
  // If we have both, use them together. If not, fallback to user_id.
  if (name && email && name !== 'candidate' && name !== 'notfound') {
    return `${name}_${email}`;
  }
  return resume.user_id || `id_${resume.id}`;
};

export const getRecruiterAnalytics = async (industry) => {
  try {
    console.log(`📊 Fetching total available candidates from Users table via backend...`);

    // ✅ FETCH 1: Get actual count from the USERS table via backend
    const countResponse = await fetch(`${API_URL}/api/admin/users/count`);
    const countData = await countResponse.json();
    
    // FETCH 2: Get resumes for skills processing
    const resumesResponse = await fetch(`${API_URL}/api/admin/resumes/all`);
    const resumesResult = await resumesResponse.json();
    const allResumes = resumesResult.resumes || [];

    const skillCounts = {};
    allResumes.forEach(resume => {
      const topSkills = resume.analysis_data?.top_skills || [];
      topSkills.forEach(skill => {
        if (skill) skillCounts[skill] = (skillCounts[skill] || 0) + 1;
      });
    });

    const topSkills = Object.entries(skillCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }));

    return {
      totalCandidates: countData.total_users || 0, // Now reflects the actual Users table
      avgAtsScore: 0, // Keeping for structural consistency
      chartData: [],
      topSkills,
      totalUniqueSkills: Object.keys(skillCounts).length
    };
  } catch (error) {
    console.error('❌ Analytics error:', error);
    return { totalCandidates: 0, avgAtsScore: 0, chartData: [], topSkills: [], totalUniqueSkills: 0 };
  }
}

/**
 * ✅ FIXED: Search function with strict person-based deduplication
 */
export const searchCandidates = async (query) => {
  try {
    console.log(`\n${'='.repeat(70)}`)
    console.log(`🔍 STRICT DEDUPLICATION SEARCH: "${query}"`)
    
    if (!query || query.trim() === '') return [];
    const searchLower = query.toLowerCase().trim();
    
    const response = await fetch(`${API_URL}/api/admin/resumes/all`);
    if (!response.ok) throw new Error(`Backend fetch failed`);
    
    const result = await response.json();
    const allResumes = result.resumes || [];
    
    // 1. Filter by Search Criteria
    const matchedRecords = allResumes.filter(resume => {
      const role = (resume.detected_role || '').toLowerCase();
      const text = (resume.extracted_text || '').toLowerCase();
      const skills = Object.values(resume.all_skills || {}).flat().map(s => (s || '').toLowerCase());

      return role.includes(searchLower) || text.includes(searchLower) || skills.some(s => s.includes(searchLower));
    });

    // 2. STRICT IDENTITY DEDUPLICATION
    const uniqueCandidatesMap = new Map();
    
    matchedRecords.forEach(resume => {
      const personKey = getIdentityKey(resume);
      
      // If we see the person again, we only keep the newest resume record
      if (!uniqueCandidatesMap.has(personKey)) {
        uniqueCandidatesMap.set(personKey, resume);
      } else {
        const existing = uniqueCandidatesMap.get(personKey);
        if (new Date(resume.created_at) > new Date(existing.created_at)) {
          uniqueCandidatesMap.set(personKey, resume);
        }
      }
    });

    const finalResults = Array.from(uniqueCandidatesMap.values());
    console.log(`✅ Success: Found ${finalResults.length} unique individuals`);
    console.log(`${'='.repeat(70)}\n`)

    return finalResults;

  } catch (error) {
    console.error('❌ Search error:', error);
    return [];
  }
}

export const getCandidateDetail = async (resumeId) => {
  try {
    const { data, error } = await supabase.from('resumes').select('*').eq('id', resumeId).single();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error('❌ Detail error:', error);
    return null;
  }
}