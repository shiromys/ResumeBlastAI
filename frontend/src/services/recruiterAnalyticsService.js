// src/services/recruiterAnalyticsService.js - FIXED: Handles Missing/Placeholder Names
// ✅ Searches ENTIRE database
// ✅ FIXED: Doesn't treat "Not Found" or empty names as duplicates
// ✅ Shows ALL unique resumes, even if name is missing

import { supabase } from '../lib/supabase'

export const getRecruiterAnalytics = async (industry) => {
  try {
    console.log(`📊 Fetching analytics for industry: ${industry}`)

    const { data, error } = await supabase
      .from('resumes')
      .select('created_at, analysis_data, all_skills, total_skills_count, ats_score')
      .order('created_at', { ascending: false })
      .limit(100) 

    if (error) throw error

    const uploadsByDate = {}
    const skillCounts = {}
    let totalCandidates = 0
    let avgAtsScore = 0
    let totalAtsScores = 0
    let scoresCount = 0

    data.forEach(resume => {
      const resumeIndustry = resume.analysis_data?.recommended_industry || 'Unspecified'
      if (industry !== 'All' && !resumeIndustry.includes(industry)) return;

      totalCandidates++

      if (resume.ats_score) {
        totalAtsScores += resume.ats_score
        scoresCount++
      }

      const date = new Date(resume.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      uploadsByDate[date] = (uploadsByDate[date] || 0) + 1

      const allSkills = resume.all_skills || {}
      const allSkillsArray = [
        ...(allSkills.technical_skills || []),
        ...(allSkills.soft_skills || []),
        ...(allSkills.tools_technologies || []),
        ...(allSkills.certifications || []),
        ...(allSkills.languages || [])
      ]

      allSkillsArray.forEach(skill => {
        if (skill && skill.trim()) {
          skillCounts[skill] = (skillCounts[skill] || 0) + 1
        }
      })

      const topSkills = resume.analysis_data?.top_skills || []
      if (allSkillsArray.length === 0 && topSkills.length > 0) {
        topSkills.forEach(skill => {
          if (skill && skill.trim()) {
            skillCounts[skill] = (skillCounts[skill] || 0) + 1
          }
        })
      }
    })

    avgAtsScore = scoresCount > 0 ? Math.round(totalAtsScores / scoresCount) : 0

    const chartData = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      chartData.push({
        date: key,
        count: uploadsByDate[key] || 0
      })
    }

    const topSkills = Object.entries(skillCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }))

    return {
      totalCandidates,
      avgAtsScore,
      chartData,
      topSkills,
      totalUniqueSkills: Object.keys(skillCounts).length
    }

  } catch (error) {
    console.error('❌ Analytics error:', error)
    return {
      totalCandidates: 0,
      avgAtsScore: 0,
      chartData: [],
      topSkills: [],
      totalUniqueSkills: 0
    }
  }
}

// ✅ FIXED: Proper handling of missing/placeholder names
export const searchCandidates = async (query) => {
  try {
    console.log(`\n${'='.repeat(70)}`)
    console.log(`🔍 CANDIDATE SEARCH STARTED`)
    console.log(`${'='.repeat(70)}`)
    console.log(`📝 Search Query: "${query}"`)
    console.log(`⏰ Started at: ${new Date().toLocaleTimeString()}`)
    
    if (!query || query.trim() === '') {
      console.log('⚠️  Empty search query - returning no results')
      return []
    }

    const searchLower = query.toLowerCase().trim();
    
    // ✅ STEP 1: Fetch ALL resumes from database using pagination
    console.log(`\n📊 PHASE 1: Database Fetch (Searching ALL resumes)`)
    console.log(`${'─'.repeat(70)}`)
    
    let allResumes = []
    let currentPage = 0
    const pageSize = 1000
    let hasMore = true
    
    while (hasMore) {
      const from = currentPage * pageSize
      const to = from + pageSize - 1
      
      console.log(`   📥 Fetching batch ${currentPage + 1} (records ${from}-${to})...`)
      
      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to)
      
      if (error) {
        console.error('❌ Database error:', error)
        throw error
      }
      
      if (!data || data.length === 0) {
        hasMore = false
        break
      }
      
      allResumes = allResumes.concat(data)
      console.log(`   ✅ Fetched ${data.length} resumes (Total so far: ${allResumes.length})`)
      
      if (data.length < pageSize) {
        hasMore = false
      }
      
      currentPage++
      
      // Safety limit
      if (allResumes.length >= 50000) {
        console.log(`   ⚠️  Reached safety limit of 50,000 resumes`)
        hasMore = false
      }
    }
    
    console.log(`\n✅ Database fetch complete: ${allResumes.length} total resumes`)
    
    if (allResumes.length === 0) {
      console.log('❌ No resumes found in database')
      return []
    }
    
    // ✅ STEP 2: Filter resumes that match search criteria
    console.log(`\n📊 PHASE 2: Filtering by Search Criteria`)
    console.log(`${'─'.repeat(70)}`)
    console.log(`   🔎 Searching for: "${searchLower}"`)
    
    const relevantResumes = allResumes.filter(resume => {
      const role = (resume.detected_role || '').toLowerCase();
      const matchesRole = role.includes(searchLower);
      
      const industry = (resume.analysis_data?.recommended_industry || '').toLowerCase();
      const matchesIndustry = industry.includes(searchLower);
      
      const allSkills = resume.all_skills || {}
      const allSkillsArray = [
        ...(allSkills.technical_skills || []),
        ...(allSkills.soft_skills || []),
        ...(allSkills.tools_technologies || []),
        ...(allSkills.certifications || []),
        ...(allSkills.languages || [])
      ].map(s => (s || '').toLowerCase());
      
      const topSkills = (resume.analysis_data?.top_skills || []).map(s => (s || '').toLowerCase());
      const combinedSkills = [...allSkillsArray, ...topSkills];
      const matchesSkills = combinedSkills.some(skill => skill.includes(searchLower));
      
      const extractedText = (resume.extracted_text || '').toLowerCase();
      const matchesText = extractedText.includes(searchLower);
      
      return matchesRole || matchesIndustry || matchesSkills || matchesText;
    });
    
    console.log(`   ✅ Found ${relevantResumes.length} resumes matching "${searchLower}"`)
    
    if (relevantResumes.length === 0) {
      console.log(`   ❌ No matches found for "${searchLower}"`)
      return []
    }
    
    // ✅ STEP 3: FIXED DEDUPLICATION - Handles missing/placeholder names properly
    console.log(`\n📊 PHASE 3: Smart Deduplication`)
    console.log(`${'─'.repeat(70)}`)
    
    const uniqueMap = new Map();
    let duplicatesRemoved = 0;
    
    // List of placeholder/invalid names to ignore
    const INVALID_NAMES = [
      'not found',
      'unknown',
      'n/a',
      'na',
      'none',
      'candidate',
      'resume',
      'anonymous',
      'user',
      'pending',
      'test',
      ''
    ];
    
    const isValidName = (name) => {
      if (!name || typeof name !== 'string') return false;
      const normalized = name.toLowerCase().trim();
      if (normalized.length < 3) return false; // Too short
      if (INVALID_NAMES.includes(normalized)) return false; // Placeholder
      return true;
    };
    
    const normalizeName = (name) => {
      if (!name || typeof name !== 'string') return '';
      return name.toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .replace(/\b(mr|mrs|ms|dr|prof|miss|sir|madam)\b/g, '')
        .trim();
    };
    
    const extractEmailFromText = (text) => {
      if (!text) return null;
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
      return emailMatch ? emailMatch[0].toLowerCase().trim() : null;
    };
    
    const extractPhoneFromText = (text) => {
      if (!text) return null;
      const phoneMatch = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch) {
        const phone = phoneMatch[0].replace(/\D/g, '');
        return phone.length >= 10 ? phone : null;
      }
      return null;
    };
    
    relevantResumes.forEach((resume, index) => {
      let uniqueKey = null;
      let keyType = 'unknown';
      
      // 🔥 STRATEGY 1: Try NAME (but only if it's a VALID name)
      const detectedName = resume.detected_name || resume.analysis_data?.detected_name;
      if (isValidName(detectedName)) {
        const normalizedName = normalizeName(detectedName);
        if (normalizedName.length > 2) {
          uniqueKey = `name_${normalizedName}`;
          keyType = 'name';
        }
      }
      
      // STRATEGY 2: Try USER_ID (for logged-in users)
      if (!uniqueKey && resume.user_id && resume.user_id.trim() !== '' && resume.user_id !== 'null') {
        uniqueKey = `user_${resume.user_id}`;
        keyType = 'user_id';
      }
      
      // STRATEGY 3: Try EMAIL (multiple sources)
      if (!uniqueKey) {
        let email = null;
        
        // Check database fields
        const emailFields = [
          resume.email,
          resume.user_email,
          resume.contact_email,
          resume.candidate_email,
          resume.analysis_data?.contact_info?.email
        ];
        
        for (const field of emailFields) {
          if (field && field.trim() !== '' && field.includes('@')) {
            email = field.toLowerCase().trim();
            break;
          }
        }
        
        // Extract from resume text
        if (!email) {
          email = extractEmailFromText(resume.extracted_text);
        }
        
        if (email) {
          uniqueKey = `email_${email}`;
          keyType = 'email';
        }
      }
      
      // STRATEGY 4: Try PHONE NUMBER
      if (!uniqueKey) {
        let phone = null;
        
        // Check database field
        if (resume.analysis_data?.contact_info?.phone) {
          phone = resume.analysis_data.contact_info.phone.replace(/\D/g, '');
        }
        
        // Extract from resume text
        if (!phone || phone.length < 10) {
          phone = extractPhoneFromText(resume.extracted_text);
        }
        
        if (phone && phone.length >= 10) {
          uniqueKey = `phone_${phone}`;
          keyType = 'phone';
        }
      }
      
      // 🔥 CRITICAL FIX: If NO unique identifier found, use RESUME_ID
      // This ensures EVERY resume is shown, even if we can't identify the person
      if (!uniqueKey) {
        uniqueKey = `resume_${resume.id}`;
        keyType = 'resume_id';
      }
      
      // Keep ONLY the FIRST occurrence (latest resume)
      if (!uniqueMap.has(uniqueKey)) {
        uniqueMap.set(uniqueKey, resume);
        
        if (index < 20) { // Log first 20 for debugging
          console.log(`   ✅ KEPT [${keyType}]: ${resume.detected_name || 'N/A'} | ${uniqueKey.substring(0, 50)}`)
        }
      } else {
        duplicatesRemoved++;
        
        if (duplicatesRemoved <= 10) { // Log first 10 duplicates
          console.log(`   🚫 SKIP [${keyType}]: ${resume.detected_name || 'N/A'} | Duplicate of ${uniqueKey.substring(0, 50)}`)
        }
      }
    });
    
    const uniqueResults = Array.from(uniqueMap.values());
    
    // Count by deduplication method
    const methodCounts = {};
    uniqueMap.forEach((resume, key) => {
      const method = key.split('_')[0];
      methodCounts[method] = (methodCounts[method] || 0) + 1;
    });
    
    console.log(`\n   📊 Deduplication Summary:`)
    console.log(`      - Original matches: ${relevantResumes.length}`)
    console.log(`      - Unique candidates: ${uniqueResults.length}`)
    console.log(`      - Duplicates removed: ${duplicatesRemoved}`)
    console.log(`\n   🔑 Identification Methods Used:`)
    Object.entries(methodCounts).forEach(([method, count]) => {
      console.log(`      - ${method}: ${count} candidates`)
    })
    
    // ✅ STEP 4: Sort by relevance
    console.log(`\n📊 PHASE 4: Sorting by Relevance`)
    console.log(`${'─'.repeat(70)}`)
    
    uniqueResults.sort((a, b) => {
      const aSkills = [
        ...((a.all_skills?.technical_skills || []).map(s => s.toLowerCase())),
        ...((a.all_skills?.soft_skills || []).map(s => s.toLowerCase())),
        ...((a.all_skills?.tools_technologies || []).map(s => s.toLowerCase()))
      ];
      
      const bSkills = [
        ...((b.all_skills?.technical_skills || []).map(s => s.toLowerCase())),
        ...((b.all_skills?.soft_skills || []).map(s => s.toLowerCase())),
        ...((b.all_skills?.tools_technologies || []).map(s => s.toLowerCase()))
      ];
      
      const aExactMatches = aSkills.filter(skill => skill === searchLower).length;
      const bExactMatches = bSkills.filter(skill => skill === searchLower).length;
      
      if (aExactMatches !== bExactMatches) {
        return bExactMatches - aExactMatches;
      }
      
      const aPartialMatches = aSkills.filter(skill => skill.includes(searchLower)).length;
      const bPartialMatches = bSkills.filter(skill => skill.includes(searchLower)).length;
      
      if (aPartialMatches !== bPartialMatches) {
        return bPartialMatches - aPartialMatches;
      }
      
      return new Date(b.created_at) - new Date(a.created_at);
    });
    
    console.log(`   ✅ Results sorted by relevance`)
    
    console.log(`\n${'='.repeat(70)}`)
    console.log(`✅ SEARCH COMPLETE`)
    console.log(`${'='.repeat(70)}`)
    console.log(`📊 Summary:`)
    console.log(`   - Total resumes scanned: ${allResumes.length}`)
    console.log(`   - Resumes matching "${searchLower}": ${relevantResumes.length}`)
    console.log(`   - Unique candidates returned: ${uniqueResults.length}`)
    console.log(`   - Processing time: ${new Date().toLocaleTimeString()}`)
    console.log(`${'='.repeat(70)}\n`)

    return uniqueResults;

  } catch (error) {
    console.error('❌ Search error:', error)
    console.error('Stack trace:', error.stack)
    return []
  }
}

export const getCandidateDetail = async (resumeId) => {
  try {
    const { data, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', resumeId)
      .single()

    if (error) throw error

    const allSkills = data.all_skills || {}
    const skillCategories = []

    if (allSkills.technical_skills && allSkills.technical_skills.length > 0) {
      skillCategories.push({
        name: 'Technical Skills',
        icon: '💻',
        skills: allSkills.technical_skills
      })
    }

    if (allSkills.soft_skills && allSkills.soft_skills.length > 0) {
      skillCategories.push({
        name: 'Soft Skills',
        icon: '🤝',
        skills: allSkills.soft_skills
      })
    }

    if (allSkills.tools_technologies && allSkills.tools_technologies.length > 0) {
      skillCategories.push({
        name: 'Tools & Technologies',
        icon: '🛠️',
        skills: allSkills.tools_technologies
      })
    }

    if (allSkills.certifications && allSkills.certifications.length > 0) {
      skillCategories.push({
        name: 'Certifications',
        icon: '🏆',
        skills: allSkills.certifications
      })
    }

    if (allSkills.languages && allSkills.languages.length > 0) {
      skillCategories.push({
        name: 'Languages',
        icon: '🌍',
        skills: allSkills.languages
      })
    }

    return {
      ...data,
      skillCategories,
      totalSkillsCount: data.total_skills_count || 0
    }
  } catch (error) {
    console.error('❌ Error fetching candidate detail:', error)
    return null
  }
}