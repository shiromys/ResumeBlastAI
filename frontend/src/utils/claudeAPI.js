import { supabase } from '../lib/supabase';

// Helper for keywords (Mock data if dynamic generation fails)
const getKeywordsForJob = (title) => {
    return {
        technical: ['GenAI', 'Python', 'React', 'Cloud Infrastructure'],
        ats: ['Strategic Planning', 'Cross-functional Leadership', 'Agile Methodology'],
        soft: ['Communication', 'Problem Solving', 'Mentorship']
    };
};

export const optimizeResumeWithKeywords = async (resumeText, jobTitle, userPreferences = {}) => {
  const keywords = getKeywordsForJob(jobTitle);
  
  const keywordString = `
Technical Skills: ${keywords.technical.join(', ')}
ATS Keywords: ${keywords.ats.join(', ')}
Soft Skills: ${keywords.soft.join(', ')}
  `;

  // STRICT PROMPT FOR FORMAT PRESERVATION
  const prompt = `You are an expert ATS Resume Optimizer. Your task is to inject keywords into an existing resume WITHOUT changing its structure, format, or content.

CRITICAL RULES - FOLLOW EXACTLY:
1. **PRESERVE ORIGINAL FORMAT**: Keep all line breaks, spacing, indentation, and structure EXACTLY as provided
2. **NO REWRITING**: Do NOT rewrite sentences, job titles, company names, or dates
3. **NO HALLUCINATIONS**: Do NOT invent companies, roles, or achievements (e.g., never create fake companies like "Resvimel")
4. **INJECTION ONLY**: Only ADD keywords where they fit naturally:
   - In existing bullet points (at the end or middle where it makes sense)
   - In skills sections (add to existing lists)
   - In summary/objective sections (weave in naturally)
5. **MINIMAL CHANGES**: Make the absolute minimum changes needed to include keywords
6. **NO HTML/MARKDOWN**: Return plain text only, preserving the exact text formatting of the input

TARGET JOB TITLE: "${jobTitle}"

KEYWORDS TO INJECT (use these strategically):
${keywordString}

ORIGINAL RESUME TEXT:
${resumeText}

INSTRUCTIONS:
- Read the resume carefully and identify WHERE keywords can be naturally added
- Add 2-3 keywords per section maximum
- Preserve ALL original content, dates, company names, and structure
- Return the COMPLETE resume with keywords injected

Return ONLY the optimized resume text. No explanations, no markdown, no code blocks.`;

  try {
    // ✅ FIX 1: Ensure API key is properly formatted (remove any whitespace/newlines)
    const apiKey = import.meta.env.VITE_CLAUDE_API_KEY?.trim();
    
    if (!apiKey) {
      console.error('❌ API Key is missing!');
      throw new Error('Claude API key is not configured. Please add VITE_CLAUDE_API_KEY to your .env file');
    }

    // ✅ FIX 2: Add detailed logging
    console.log('🔑 API Key length:', apiKey.length);
    console.log('🔑 API Key starts with:', apiKey.substring(0, 7));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0.3, 
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      // ✅ FIX 3: Better error handling
      console.error('❌ Claude API Error Response:', data);
      
      if (data.error?.type === 'authentication_error') {
        throw new Error('Invalid API key. Please check your VITE_CLAUDE_API_KEY in .env file');
      }
      
      throw new Error(data.error?.message || `API Error: ${response.status}`);
    }

    // Clean up response - remove any markdown artifacts
    let optimizedContent = data.content[0].text;
    optimizedContent = optimizedContent
      .replace(/```html/g, '')
      .replace(/```text/g, '')
      .replace(/```/g, '')
      .trim();

    console.log('✅ Optimization complete - format preserved');

    return {
      optimizedText: optimizedContent,
      keywordsMatched: keywords,
      jobTitle: jobTitle
    };
  } catch (error) {
    console.error('❌ Claude API Error:', error);
    throw error;
  }
};