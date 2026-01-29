# backend/routes/analyze.py - ENHANCED VERSION
from flask import Blueprint, request, jsonify
import anthropic
import os
import re
import json
from datetime import datetime

analyze_bp = Blueprint('analyze', __name__, url_prefix='/api')

# Initialize Anthropic client
anthropic_client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

def extract_years_of_experience(text):
    """Extract years of experience from resume text"""
    patterns = [
        r'(\d+)\+?\s*years?\s+of\s+experience',
        r'experience:\s*(\d+)\+?\s*years?',
        r'(\d+)\+?\s*yrs?\s+experience'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return int(match.group(1))
    
    # Fallback: Count date ranges in experience section
    date_pattern = r'\b(19|20)\d{2}\b'
    dates = re.findall(date_pattern, text)
    if len(dates) >= 2:
        years = sorted([int(d) for d in dates])
        return datetime.now().year - years[0]
    
    return 0

def calculate_ats_score(analysis_data):
    """
    Calculate ATS score based on multiple factors
    
    Scoring Breakdown (Total: 100 points):
    - Contact Information (10 points): Email, Phone, Location
    - Skills Section (30 points): Number and categorization of skills
    - Work Experience (25 points): Years and detail level
    - Education (20 points): Degree and institution
    - Keywords & Formatting (15 points): Industry terms and structure
    """
    score = 0
    score_breakdown = {}
    
    # 1. Contact Information (20 points)
    contact_score = 0
    if analysis_data.get('candidate_email') and '@' in analysis_data['candidate_email'] and analysis_data['candidate_email'] != 'Not Found':
        contact_score += 7
    if analysis_data.get('candidate_phone') and analysis_data['candidate_phone'] != 'Not Found':
        contact_score += 7
    if analysis_data.get('location') and analysis_data['location'] != 'Not Specified':
        contact_score += 6
    score += contact_score
    score_breakdown['contact_info'] = contact_score
    
    # 2. Skills Section (25 points) - ENHANCED FOR ALL SKILLS
    all_skills = analysis_data.get('all_skills', {})
    total_skills_count = (
        len(all_skills.get('technical_skills', [])) +
        len(all_skills.get('soft_skills', [])) +
        len(all_skills.get('tools_technologies', [])) +
        len(all_skills.get('certifications', [])) +
        len(all_skills.get('languages', []))
    )
    
    if total_skills_count >= 30:
        skills_score = 25
    elif total_skills_count >= 20:
        skills_score = 20
    elif total_skills_count >= 15:
        skills_score = 15
    elif total_skills_count >= 10:
        skills_score = 10
    elif total_skills_count >= 5:
        skills_score = 5
    else:
        skills_score = 2
    
    score += skills_score
    score_breakdown['skills'] = skills_score
    
    # 3. Work Experience (25 points)
    years_exp = analysis_data.get('years_of_experience', 0)
    if years_exp >= 10:
        exp_score = 25
    elif years_exp >= 5:
        exp_score = 20
    elif years_exp >= 3:
        exp_score = 15
    elif years_exp >= 1:
        exp_score = 10
    else:
        exp_score = 5
    
    score += exp_score
    score_breakdown['experience'] = exp_score
    
    # 4. Education (15 points)
    education = analysis_data.get('education_summary', '').lower()
    if any(degree in education for degree in ['phd', 'doctorate', 'ph.d']):
        edu_score = 15
    elif any(degree in education for degree in ['master', 'mba', 'm.s', 'm.a', 'm.tech']):
        edu_score = 13
    elif any(degree in education for degree in ['bachelor', 'degree', 'b.s', 'b.a', 'b.tech', 'b.e']):
        edu_score = 11
    elif education and education != 'not specified':
        edu_score = 7
    else:
        edu_score = 0
    
    score += edu_score
    score_breakdown['education'] = edu_score
    
    # 5. Keywords & Formatting (15 points)
    keywords_score = 0
    if analysis_data.get('detected_role') and analysis_data['detected_role'] != 'General':
        keywords_score += 5
    if analysis_data.get('recommended_industry'):
        keywords_score += 5
    if total_skills_count > 0:
        keywords_score += 5
    
    score += keywords_score
    score_breakdown['keywords'] = keywords_score
    
    final_score = min(score, 100)  # Cap at 100
    
    return {
        'score': final_score,
        'breakdown': score_breakdown,
        'total_skills_found': total_skills_count
    }

# ✅ CHANGED: /analyze-resume → /analyze
@analyze_bp.route('/analyze', methods=['POST', 'OPTIONS'])
def analyze_resume():
    """
    Enhanced Resume Analysis Endpoint
    Extracts ALL skills, calculates detailed ATS score, and provides comprehensive insights
    """
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        return '', 204
    
    try:
        data = request.get_json()
        resume_text = data.get('resume_text', '')
        
        if not resume_text or len(resume_text) < 100:
            return jsonify({
                'success': False,
                'error': 'Resume text is too short or empty'
            }), 400
        
        print(f"\n{'='*70}")
        print("📊 STARTING COMPREHENSIVE RESUME ANALYSIS")
        print(f"{'='*70}")
        print(f"📄 Resume Length: {len(resume_text)} characters")
        
        # Construct enhanced prompt for Claude
        analysis_prompt = f"""You are an expert ATS (Applicant Tracking System) analyzer and career consultant. Analyze the following resume COMPLETELY and extract ALL information in structured JSON format.

RESUME TEXT:
{resume_text}

CRITICAL INSTRUCTIONS:
1. Extract ALL skills mentioned anywhere in the resume (technical, soft skills, tools, technologies, certifications, languages)
2. Do NOT limit to just "top" skills - include EVERY skill you find
3. Categorize skills into: technical_skills, soft_skills, tools_technologies, certifications, languages
4. Extract complete work experience with years calculation
5. Provide detailed education information
6. Calculate realistic years of experience based on work history dates

Return ONLY a valid JSON object with this EXACT structure (no markdown, no explanations, no code blocks):

{{
  "candidate_name": "Full name from resume or 'Not Found'",
  "candidate_email": "Email address or 'Not Found'",
  "candidate_phone": "Phone number or 'Not Found'",
  "location": "City, State/Country or 'Not Specified'",
  "linkedin_url": "LinkedIn URL if present or empty string",
  "detected_role": "Primary job title/role (e.g., 'Senior Software Engineer', 'Data Scientist')",
  "seniority_level": "Entry-Level/Mid-Level/Senior/Lead/Executive",
  "years_of_experience": 5,
  "recommended_industry": "Primary industry (e.g., 'Technology', 'Healthcare', 'Finance')",
  "education_summary": "Highest degree and institution (e.g., 'B.S. Computer Science, MIT')",
  "all_skills": {{
    "technical_skills": ["Python", "Java", "Machine Learning", "SQL", "etc"],
    "soft_skills": ["Leadership", "Communication", "Problem Solving", "etc"],
    "tools_technologies": ["AWS", "Docker", "Git", "Jenkins", "etc"],
    "certifications": ["AWS Certified", "PMP", "etc"],
    "languages": ["English", "Spanish", "etc"]
  }},
  "top_skills": ["Most important 8-10 skills for quick display"],
  "work_experience_summary": "Brief summary of career progression",
  "key_achievements": ["Notable achievement 1", "Notable achievement 2", "etc"],
  "blast_recommendation": "Brief recommendation for resume distribution"
}}

IMPORTANT: 
- Return ONLY the JSON object, no additional text
- Ensure all arrays are populated (use empty arrays [] if no data found)
- Be thorough in extracting ALL skills from the entire resume
- If information is not found, use "Not Found" or "Not Specified" as appropriate"""

        print("🤖 Sending request to Claude AI...")
        
        # Call Claude API
        message = anthropic_client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4000,
            temperature=0.3,
            messages=[{
                "role": "user",
                "content": analysis_prompt
            }]
        )
        
        # Extract response
        response_text = message.content[0].text.strip()
        print(f"✅ Claude Response received ({len(response_text)} chars)")
        
        # Clean up response (remove markdown if present)
        response_text = response_text.replace('```json', '').replace('```', '').strip()
        
        # Parse JSON
        try:
            ai_analysis = json.loads(response_text)
        except json.JSONDecodeError as e:
            print(f"❌ JSON Parse Error: {e}")
            print(f"Response text: {response_text[:500]}...")
            raise ValueError("AI returned invalid JSON format")
        
        # Calculate ATS Score with breakdown
        score_result = calculate_ats_score(ai_analysis)
        ai_analysis['ats_score'] = score_result['score']
        ai_analysis['score_breakdown'] = score_result['breakdown']
        ai_analysis['total_skills_count'] = score_result['total_skills_found']
        
        print(f"\n{'='*70}")
        print("✅ ANALYSIS COMPLETE")
        print(f"{'='*70}")
        print(f"👤 Candidate: {ai_analysis.get('candidate_name', 'N/A')}")
        print(f"💼 Role: {ai_analysis.get('detected_role', 'N/A')}")
        print(f"📊 ATS Score: {ai_analysis['ats_score']}/100")
        print(f"🔧 Total Skills Found: {score_result['total_skills_found']}")
        print(f"Score Breakdown: {score_result['breakdown']}")
        print(f"{'='*70}\n")
        
        return jsonify(ai_analysis), 200
        
    except anthropic.APIError as e:
        print(f"❌ Anthropic API Error: {e}")
        return jsonify({
            'success': False,
            'error': f'AI service error: {str(e)}'
        }), 500
        
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': f'Analysis failed: {str(e)}'
        }), 500

# ✅ CHANGED: /analyze-resume/test → /test
@analyze_bp.route('/test', methods=['GET'])
def test_analyze():
    """Test endpoint to verify the analyze route is registered"""
    return jsonify({
        'status': 'success',
        'message': 'Resume analysis endpoint is active',
        'anthropic_configured': bool(os.getenv('ANTHROPIC_API_KEY'))
    }), 200