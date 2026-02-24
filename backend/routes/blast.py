from flask import Blueprint, request, jsonify
import os, requests, sys
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.recruiter_email_service import RecruiterEmailService
from services.freemium_email_service import FreemiumEmailService
from routes.drip_campaign import create_drip_campaign
from services.drip_scheduler import run_day1_blast

blast_bp = Blueprint("blast", __name__)
email_service = RecruiterEmailService()
freemium_service = FreemiumEmailService()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
DRIP_PLANS = {"starter","basic","professional","growth","advanced","premium"}
FREE_PLANS  = {"free","freemium"}

def get_db_headers():
    return {"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}","Content-Type":"application/json","Prefer":"return=representation"}

def fetch_candidate_details_from_db(resume_url):
    try:
        if not resume_url: return None,None,None
        r = requests.get(f"{SUPABASE_URL}/rest/v1/resumes?file_url=eq.{resume_url}&select=analysis_data",headers=get_db_headers())
        if r.status_code==200 and r.json():
            a=r.json()[0].get("analysis_data",{})
            n,e,ro=a.get("candidate_name"),a.get("candidate_email"),a.get("detected_role")
            if n in ["Not Found",None,""]: n=None
            if e in ["Not Found",None,""]: e=None
            if ro in ["Not Found",None,""]: ro=None
            return n,e,ro
        return None,None,None
    except: return None,None,None

def get_plan_limit(plan_name):
    fb={"starter":250,"basic":500,"professional":750,"growth":1000,"advanced":1250,"premium":1500,"free":11}
    try:
        r=requests.get(f"{SUPABASE_URL}/rest/v1/plans?key_name=eq.{plan_name}&select=recruiter_limit",headers=get_db_headers())
        if r.status_code==200 and r.json(): return r.json()[0]["recruiter_limit"]
    except: pass
    return fb.get(plan_name,250)

@blast_bp.route("/api/blast/send",methods=["POST"])
def send_blast():
    try:
        blast_data=request.json
        if not blast_data: return jsonify({"success":False,"error":"No data"}),400
        plan_name=blast_data.get("plan_name","starter").lower()
        user_id=blast_data.get("user_id","")
        resume_url=blast_data.get("resume_url","")
        resume_name=blast_data.get("resume_name","Resume.pdf")
        print(f"BLAST plan={plan_name} user={user_id}")
        if plan_name in FREE_PLANS: return jsonify({"success":False,"error":"Use /api/blast/freemium for free plan"}),400
        if not resume_url: return jsonify({"success":False,"error":"Resume URL required"}),400
        plan_limit=get_plan_limit(plan_name)
        is_guest=str(user_id).startswith("guest_")
        user_type="guest" if is_guest else "registered"
        db_name,db_email,db_role=fetch_candidate_details_from_db(resume_url)
        final_name=db_name or blast_data.get("candidate_name","Professional Candidate")
        final_email=db_email or blast_data.get("candidate_email","")
        final_role=db_role or blast_data.get("job_role","Professional")
        drip_result=create_drip_campaign({"user_id":user_id,"user_type":user_type,"stripe_session_id":blast_data.get("stripe_session_id",""),"plan_name":plan_name,"candidate_name":final_name,"candidate_email":final_email,"candidate_phone":blast_data.get("candidate_phone",""),"job_role":final_role,"resume_url":resume_url,"resume_name":resume_name,"years_experience":blast_data.get("years_experience","0"),"key_skills":blast_data.get("key_skills","Professional Skills"),"location":blast_data.get("location","Remote"),"total_recruiters":plan_limit})
        if not drip_result.get("success"): return jsonify({"success":False,"error":"Failed to create drip campaign"}),500
        drip_campaign_id=drip_result["campaign_id"]
        day1_result=run_day1_blast(drip_campaign_id)
        s=day1_result.get("stats",{"sent":0,"failed":0,"total":plan_limit})
        sent,failed,total=s.get("sent",0),s.get("failed",0),s.get("total",plan_limit)
        return jsonify({"success":True,"drip_mode":True,"drip_campaign_id":drip_campaign_id,"message":f"Day 1 blast sent to {sent} recruiters. Follow-ups scheduled Day 4 and Day 8.","total_recipients":total,"successful_sends":sent,"failed_sends":failed,"plan_used":plan_name,"plan_limit_enforced":plan_limit,"success_rate":f"{(sent/total*100):.1f}%" if total>0 else "0%","schedule":{"day1":"Sent now","day4":"3 business days 9-11AM or 12:30-2PM EST","day8":"7 business days 9-11AM or 12:30-2PM EST"}}),200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"success":False,"error":str(e)}),500

@blast_bp.route("/api/blast/freemium",methods=["POST"])
def send_freemium_blast():
    try:
        data=request.json
        user_id=data.get("user_id")
        resume_url=data.get("resume_url")
        if not user_id or not resume_url: return jsonify({"success":False,"error":"Missing user_id or resume_url"}),400
        if str(user_id).startswith("guest_"): return jsonify({"success":False,"error":"Guest users must use a paid plan."}),403
        cr=requests.get(f"{SUPABASE_URL}/rest/v1/blast_campaigns?user_id=eq.{user_id}&select=id",headers=get_db_headers())
        if cr.status_code!=200: return jsonify({"success":False,"error":"Failed to check eligibility"}),500
        if len(cr.json())>0: return jsonify({"success":False,"error":"Free blast already used. Please upgrade."}),403
        db_name,db_email,db_role=fetch_candidate_details_from_db(resume_url)
        candidate_data={"candidate_name":db_name or data.get("candidate_name","Candidate"),"candidate_email":db_email or data.get("candidate_email",""),"candidate_phone":data.get("candidate_phone",""),"job_role":db_role or data.get("job_role","Professional")}
        result=freemium_service.send_freemium_blast(candidate_data,resume_url)
        if not result["success"]: return jsonify(result),500
        requests.post(f"{SUPABASE_URL}/rest/v1/blast_campaigns",json={"user_id":user_id,"user_type":"registered","status":"completed","recipients_count":result["total"],"plan_name":"free","industry":"Freemium","initiated_at":datetime.utcnow().isoformat(),"completed_at":datetime.utcnow().isoformat(),"result_data":result},headers=get_db_headers())
        return jsonify({"success":True,"message":"Free blast sent!","details":result}),200
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"success":False,"error":str(e)}),500

@blast_bp.route("/api/blast/test",methods=["GET"])
def test_blast():
    return jsonify({"success":True,"message":"Blast API operational - Drip active","brevo_configured":bool(os.getenv("BREVO_API_KEY")),"resend_configured":bool(os.getenv("RESEND_API_KEY")),"drip_plans":list(DRIP_PLANS),"free_plans":list(FREE_PLANS),"timestamp":datetime.utcnow().isoformat()}),200

@blast_bp.route("/api/blast/test-single",methods=["POST"])
def test_single_email():
    try:
        data=request.json
        result=email_service.send_resume_to_recruiter(candidate_data={"candidate_name":"Test","candidate_email":"test@resumeblast.ai","candidate_phone":"","job_role":"Engineer","years_experience":"5","key_skills":"Python","education_level":"BS","location":"Remote","linkedin_url":""},recruiter_data={"email":data.get("test_email","test@example.com"),"name":"Test","company":"Test Co"},resume_url=data.get("resume_url","https://example.com/sample.pdf"),resume_name="Test.pdf")
        if result["success"]: return jsonify({"success":True,"message_id":result["message_id"]}),200
        return jsonify({"success":False,"error":result["error"]}),500
    except Exception as e:
        return jsonify({"success":False,"error":str(e)}),500