# app.py
from fastapi import FastAPI, File, UploadFile, Form, Depends, HTTPException, Header, Request, APIRouter, Body
from backend.models.user_model import UserSchema
from backend.database import users_collection, interviews_collection
from datetime import datetime
from pydantic import BaseModel
from backend.auth import get_current_user, get_current_user_full
from fastapi.middleware.cors import CORSMiddleware
from backend.interview_session import InterviewSession
from backend.resume_parser import parse_resume_with_llm
from backend.coding_session import CodingSession
from backend.speech_to_text import transcribe
from langchain_ollama import OllamaLLM  
from uuid import uuid4
from backend.interview_session import InterviewSession
from backend.confidence_utils import get_confidence_score
from typing import Optional
from bson import ObjectId
from backend.routes import dashboard

import json
import numpy as np
from backend.hr_session import HRInterviewSession
from backend.routes.user import router as user_router

from langchain_core.prompts import PromptTemplate
import tempfile
import os
import uvicorn
import subprocess

app = FastAPI()
user_sessions = {}

router = APIRouter()
app.include_router(user_router)
app.include_router(dashboard.router)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # instead of ["*"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-User-Id", "X-User-Email"],  # ✅ explicitly allow Clerk headers
)


class CodeSubmission(BaseModel):
    code: str









@app.post("/api/setup")
async def setup_session(

    body: dict = Body(None),
    user: str = Depends(get_current_user)

):
    
    if body:
        print("📦 JSON BODY RECEIVED:", body)

    # Merge fallback if needed
    if body:
        role =  body.get("role")
        interview_type =  body.get("interview_type")
        duration =  body.get("duration")

    if not all([role, interview_type, duration]):
        raise HTTPException(status_code=400, detail="Missing fields in setup request")

    print("✅ Parsed values:", role, interview_type, duration)
    

    session_id = str(uuid4())

    # Load parsed resume text from DB using clerkId
    user_data = users_collection.find_one({"clerkId": user})
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    resume = {
        "name": user_data.get("name", ""),
        "skills": user_data.get("skills", []),
        "projects": user_data.get("projects", []),
        "experience": user_data.get("experience", []),
        "education": user_data.get("education", []),
        "targetCompanies": user_data.get("targetCompanies", [])
    }

    # Convert to structured text
    resume_text = "\n".join([
        f"Name: {resume.get('name')}",
        "Skills: " + ", ".join(resume.get("skills", [])),
        "Projects: " + ", ".join(resume.get("projects", [])),
        "Experience: " + ", ".join(resume.get("experience", [])),
        "Education: " + ", ".join(resume.get("education", [])),
        "Target Companies: " + ", ".join(resume.get("targetCompanies", []))
    ])


    # Duration to rounds mapping
    duration_to_rounds = {
        3: 7,
        5: 10,
        10: 15,
        15: 20,
        20: 25,
        30: 30
    }

    # Validate duration
    if duration not in duration_to_rounds:
        raise HTTPException(status_code=400, detail="Invalid duration value. Must be one of {3, 5, 10, 15, 20, 30}.")

    rounds = duration_to_rounds[duration]

    # Session setup logic
    if interview_type == "technical":
        user_sessions[user] = InterviewSession(role=role, resume_obj=resume_text, rounds=rounds, session_id=session_id)

    elif interview_type == "behavioral":
        user_sessions[user] = HRInterviewSession(role=role, rounds=rounds, session_id=session_id)

    elif interview_type == "coding":
        # Skip coding round for frontend roles if desired
        if role.lower() == "frontend developer":
            raise HTTPException(status_code=400, detail="Frontend developers do not have coding rounds.")
        user_sessions[user] = CodingSession(role=role, rounds=rounds)

    elif interview_type == "full":
        session_data = {
            "mode": "full",
            "tech": InterviewSession(role=role, resume_obj=resume_text, rounds=rounds, session_id=session_id),
            "hr": HRInterviewSession(role=role, rounds=rounds, session_id=session_id + "_hr"),
            "current": "tech",
            "role": role
        }

        if role.lower() != "frontend developer":
            session_data["code"] = CodingSession(role=role, rounds=rounds)

        user_sessions[user] = session_data

    else:
        raise HTTPException(status_code=400, detail="Invalid interview type")

    return {"session_id": session_id}



@app.post("/api/parse-resume")
async def parse_resume_endpoint(resume: UploadFile = File(...), user: str = Depends(get_current_user)):
    # Save resume to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        contents = await resume.read()
        tmp.write(contents)
        tmp_path = tmp.name

    result = parse_resume_with_llm(tmp_path)

    if "error" in result:
        raise HTTPException(status_code=400, detail="Resume parsing failed")

    return result


@app.post("/api/audio")
async def handle_audio(audio: UploadFile = File(...), focus_score: Optional[float] = Form(1.0), user: str = Depends(get_current_user)):
    session_info = user_sessions.get(user)

    if not session_info:
        raise HTTPException(status_code=404, detail="No active session")

    # Save audio
    contents = await audio.read()
    tmp_path = f"temp_{uuid4().hex}.wav"



    with open(tmp_path, "wb") as f:
        f.write(contents)
    if os.path.getsize(tmp_path) < 1000:  # roughly <1KB = empty/silent
        os.remove(tmp_path)
        # Return initial question instead of transcribing
        session = user_sessions[user]
        
        first_question = session.ask_question()
        return {"text": first_question, "answer": "", "confidence": 0.0}

    answer = transcribe(tmp_path)
    """
    wav_path=f"temp_wav_{uuid4().hex}.wav"
    cmd = [
        "ffmpeg", "-y",
        "-fflags", "+genpts",
        "-i", tmp_path,
        "-acodec", "pcm_s16le",
        "-ac", "1",
        "-ar", "16000",
        wav_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    print("FFMPEG STDERR:", result.stderr)

"""
    confidence = get_confidence_score(tmp_path)

    # cleanup
    os.remove(tmp_path)
    #os.remove(wav_path)

    # Get the current session object
    if isinstance(session_info, dict):
        session = session_info.get(session_info.get("current"))
    else:
        session = session_info

    # Ensure session.meta exists
    if not hasattr(session, "meta") or session.meta is None:
        session.meta = {}

    # Add metrics
    session.meta.setdefault("confidence_scores", []).append(confidence)
    session.meta.setdefault("focus_scores", []).append(focus_score)

    # FULL INTERVIEW MODE
    if isinstance(session_info, dict):
        current_round = session_info["current"]
        session = session_info[current_round]

        # First-time greeting
        if not session.history and not session.meta.get("greeting_sent"):
            session.meta["greeting_sent"] = True

            if answer.strip():
                session.provide_answer(answer)
                next_q = session.ask_question()
                return {"text": next_q, "answer": answer, "confidence": confidence}
            
            first_question = session.ask_question()
            return {"text": first_question, "answer": "", "confidence": confidence}

        # Process answer
        session.provide_answer(answer)
        next_q = session.ask_question()

        if next_q:
            return {"text": next_q, "answer": answer, "confidence": confidence}
        else:
            # Switch rounds
            if current_round == "tech":
                if "frontend" in session_info["role"].lower():
                    session_info["current"] = "hr"
                    return {"text": "Awesome. Now let's start the behavioral (HR) round.", "answer": answer, "confidence": confidence}

                session_info["current"] = "code"
                return {"text": "Okay! Now let's move to the live coding round.", "answer": answer, "confidence": confidence}
            elif current_round == "code":
                session_info["current"] = "hr"
                return {"text": "Okay. Now let's start the behavioral (HR) round. Tell me about your Strengths and Weaknesses?", "answer": answer, "confidence": confidence}
            else:
                return {"text": "The interview is complete. Thank you!", "answer": answer, "confidence": confidence}

    # SINGLE ROUND MODE
    else:
        session = session_info

        if not session.history and not session.meta.get("greeting_sent"):
            session.meta["greeting_sent"] = True

            if answer.strip():
                session.provide_answer(answer)
                next_q = session.ask_question()
                return {"text": next_q, "answer": answer, "confidence": confidence}
            
            first_question = session.ask_question()
            return {"text": first_question, "answer": "", "confidence": confidence}

        session.provide_answer(answer)
        next_q = session.ask_question()

        if next_q:
            return {"text": next_q, "answer": answer, "confidence": confidence}
        else:
            return {"text": "The interview is complete. Thank you!", "answer": answer, "confidence": confidence}


@app.get("/api/feedback")
def get_feedback(user: str = Depends(get_current_user)):
    session_info = user_sessions.get(user)

    if not session_info:
        raise HTTPException(status_code=404, detail="No active session")

    feedback_data = {}
    transcript_data = ""

    session = session_info if not isinstance(session_info, dict) else session_info.get(session_info["current"])
    if not hasattr(session, "meta") or session.meta is None:
        session.meta = {}

    # ----------- Build Feedback + Transcript -----------
    if isinstance(session_info, dict) and session_info.get("mode") == "full":
        tech_fb = session_info["tech"].generate_feedback()
        hr_fb = session_info["hr"].generate_feedback()
        feedback_data = {
            "technical": tech_fb,
            "behavioral": hr_fb
        }

        if "code" in session_info:
            code_fb = session_info["code"].generate_feedback()
            feedback_data["coding"] = code_fb

        transcript_data = "\n".join([
            f"Q: {q['question']}\nA: {q['answer']}"
            for q in session_info["tech"].history + session_info["hr"].history
        ])

    else:
        summary = session.generate_feedback()
        feedback_data = json.loads(summary) if isinstance(summary, str) else summary

        transcript_data = "\n".join([
            f"Q: {q['question']}\nA: {q['answer']}"
            for q in session.history
        ])

    # ----------- Compute Metrics -----------
    if isinstance(session_info, dict):
        all_conf, all_focus = [], []
        for key in ["tech", "hr"]:
            scores = getattr(session_info[key], "meta", {})
            all_conf += scores.get("confidence_scores", [])
            all_focus += scores.get("focus_scores", [])
        avg_conf = float(np.mean(all_conf)) if all_conf else 0.0
        avg_focus = float(np.mean(all_focus)) if all_focus else 0.0
    else:
        avg_conf = float(np.mean(session.meta.get("confidence_scores", [])))
        avg_focus = float(np.mean(session.meta.get("focus_scores", [])))

    # ----------- Save Interview Once -----------
    inserted_id = None
    if not session.meta.get("feedback_saved"):
        doc = {
            "userId": user,
            "role": session_info["tech"].role if isinstance(session_info, dict) else session.role,
            "date": datetime.now().isoformat(),
            "mode": session_info["mode"] if isinstance(session_info, dict) else getattr(session_info, "round_type", "custom"),
            "transcript": transcript_data,
            "feedback": feedback_data,
            "average_confidence": avg_conf,
            "average_focus": avg_focus
        }

        result = interviews_collection.insert_one(doc)
        inserted_id = str(result.inserted_id)

        session.meta["feedback_saved"] = True
        session.meta["inserted_id"] = inserted_id

    else:
        inserted_id = session.meta.get("inserted_id")

    # ----------- Return Everything Needed by Frontend -----------
    return {
        "id": inserted_id,
        "feedback": feedback_data,
        "average_confidence": avg_conf,
        "average_focus": avg_focus,
        "transcript": transcript_data,
    }

    session_info = user_sessions.get(user)

    if not session_info:
        raise HTTPException(status_code=404, detail="No active session")

    feedback_data = {}
    transcript_data = ""

    session = session_info if not isinstance(session_info, dict) else session_info.get(session_info["current"])
    if not hasattr(session, "meta") or session.meta is None:
        session.meta = {}

    if isinstance(session_info, dict) and session_info.get("mode") == "full":
        tech_fb = session_info["tech"].generate_feedback()
        hr_fb = session_info["hr"].generate_feedback()

        feedback_data = {
            "technical": tech_fb,
            "behavioral": hr_fb
        }

        if "code" in session_info:
            code_fb = session_info["code"].generate_feedback()
            feedback_data["coding"] = code_fb

        transcript_data = "\n".join([
            f"Q: {q['question']}\nA: {q['answer']}"
            for q in session_info["tech"].history + session_info["hr"].history
        ])

    else:
        summary = session.generate_feedback()
        feedback_data = json.loads(summary) if isinstance(summary, str) else summary

        transcript_data = "\n".join([
            f"Q: {q['question']}\nA: {q['answer']}"
            for q in session.history
        ])

    # Collect average metrics
    if isinstance(session_info, dict):
        all_conf, all_focus = [], []
        for key in ["tech", "hr"]:
            scores = getattr(session_info[key], "meta", {})
            all_conf += scores.get("confidence_scores", [])
            all_focus += scores.get("focus_scores", [])
        avg_conf = float(np.mean(all_conf)) if all_conf else 0.0
        avg_focus = float(np.mean(all_focus)) if all_focus else 0.0
    else:
        avg_conf = float(np.mean(session.meta.get("confidence_scores", [])))
        avg_focus = float(np.mean(session.meta.get("focus_scores", [])))

    # PREVENT DUPLICATE SAVES
    if not session.meta.get("feedback_saved"):
        interviews_collection.insert_one({
            "userId": user,  # This is now clerkId
            "role": session_info["tech"].role if isinstance(session_info, dict) else session.role,
            "date": datetime.now().isoformat(),
            "mode": session_info["mode"] if isinstance(session_info, dict) else getattr(session_info, "round_type", "custom"),
            "transcript": transcript_data,
            "feedback": feedback_data,
            "average_confidence": avg_conf,
            "average_focus": avg_focus
        })
        session.meta["feedback_saved"] = True
    else:
        print("🛑 Feedback already saved. Skipping DB insert.")

    return {
        **feedback_data,
        "average_confidence": avg_conf,
        "average_focus": avg_focus,
    }


@app.get("/api/coding-problem")
def get_coding_problem(user: str = Depends(get_current_user)):
    session_info = user_sessions.get(user)

    if not session_info:
        raise HTTPException(status_code=404, detail="No active session found.")

    # Full interview mode
    if isinstance(session_info, dict) and session_info.get("mode") == "full":
        if session_info.get("current") != "code":
            raise HTTPException(status_code=400, detail="Not in coding round yet.")

        if "code" not in session_info:
            session_info["code"] = CodingSession(role=session_info["tech"].role, rounds=3)

        session = session_info["code"]

    elif isinstance(session_info, CodingSession):
        session = session_info

    else:
        raise HTTPException(status_code=400, detail="No coding session active.")

    problem = session.get_next_problem()
    if not problem:
        raise HTTPException(status_code=204, detail="No more coding problems.")

    return problem


@app.post("/api/submit-code")
async def submit_code(request: Request, user: str = Depends(get_current_user)):
    data = await request.json()
    code = data.get("code")

    session_info = user_sessions.get(user)
    if not session_info:
        raise HTTPException(status_code=404, detail="No active session")

    if isinstance(session_info, dict) and session_info.get("mode") == "full":
        session = session_info.get("code")
        session.submit_solution(code)

        next_problem = session.get_next_problem()
        if next_problem:
            return {"next": True, "problem": next_problem}

        session_info["current"] = "hr"
        return {
            "next": False,
            "message": "Coding round complete. Moving to HR."
        }

    elif isinstance(session_info, CodingSession):
        session_info.submit_solution(code)
        return {"next": False, "message": "Thanks for your submission."}

    else:
        raise HTTPException(status_code=400, detail="Invalid coding session")


from langchain_core.prompts import ChatPromptTemplate
from backend.llm_groq_config import code_llm

@app.post("/api/code-explanation")
async def handle_code_explanation(audio: UploadFile = File(...), user: str = Depends(get_current_user)):
    session_info = user_sessions.get(user)

    if not session_info:
        raise HTTPException(status_code=404, detail="No session")

    if isinstance(session_info, dict) and session_info.get("mode") == "full":
        session = session_info.get("code")
    elif isinstance(session_info, CodingSession):
        session = session_info
    else:
        raise HTTPException(status_code=400, detail="Not in coding session")

    contents = await audio.read()
    tmp_path = f"temp_explain_{uuid4().hex}.wav"
    with open(tmp_path, "wb") as f:
        f.write(contents)

    user_text = transcribe(tmp_path)
    os.remove(tmp_path)

    session.explanation_history.append({"user": user_text})

    from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

    messages = [
        SystemMessage(content="You're a friendly technical recruiter conducting a coding interview. You have access to the problem, the candidate's code, and the ongoing explanation conversation."),
        HumanMessage(content="Problem:\n" + json.dumps(session.history[-1]["problem"], indent=2)),
        HumanMessage(content="Code:\n" + session.history[-1]["code"]),
    ]

    for msg in session.explanation_history:
        if "user" in msg:
            messages.append(HumanMessage(content=msg["user"]))
        elif "ai" in msg:
            messages.append(AIMessage(content=msg["ai"]))

    response = code_llm.invoke(messages).content

    session.explanation_history.append({"ai": response})

    return {
        "user_text": user_text,
        "response": response
    }


@app.get("/api/interviews")
def get_user_interviews(user: str = Depends(get_current_user)):
    interviews = list(interviews_collection.find({"userId": user}))
    for i in interviews:
        i["_id"] = str(i["_id"])
    return interviews


@app.get("/api/interviews/{interview_id}")
def get_interview(interview_id: str, user: str = Depends(get_current_user)):
    interview = interviews_collection.find_one({"_id": ObjectId(interview_id), "userId": user})
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    interview["_id"] = str(interview["_id"])
    return interview


@app.get("/api/history")
def get_history(user: str = Depends(get_current_user)):
    session = user_sessions.get(user)

    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if isinstance(session, dict):
        current_round = session.get(session['current'])
        history = current_round.history if current_round else []
    else:
        history = session.history

    return {"history": history}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port)