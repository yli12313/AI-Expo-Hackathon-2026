import streamlit as st

st.set_page_config(
    page_title="Duty Line",
    page_icon="🪖",
    layout="wide"
)

st.markdown("""
<style>
.stApp {
    background: linear-gradient(180deg, #F5F3EE 0%, #F0EEE8 100%);
}

.block-container {
    padding-top: 2rem;
    padding-bottom: 2rem;
    max-width: 1200px;
}

.dl-hero {
    background: linear-gradient(135deg, #ffffff 0%, #f7f5f0 100%);
    border: 1px solid #D8D6CF;
    border-radius: 18px;
    padding: 1.4rem 1.6rem;
    box-shadow: 0 8px 24px rgba(31, 41, 55, 0.06);
    margin-bottom: 1rem;
}

.dl-kicker {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6B7280;
    margin-bottom: 0.35rem;
    font-weight: 700;
}

.dl-title {
    font-size: 2.4rem;
    line-height: 1.05;
    font-weight: 800;
    color: #1F2937;
    margin-bottom: 0.45rem;
}

.dl-subtitle {
    font-size: 1rem;
    color: #4B5563;
    max-width: 760px;
}

section[data-testid="stSidebar"] {
    background: #ECE8DF;
    border-right: 1px solid #D8D6CF;
}

div[data-testid="metric-container"] {
    background: #FFFFFF;
    border: 1px solid #D8D6CF;
    padding: 18px 16px;
    border-radius: 16px;
    box-shadow: 0 4px 14px rgba(31, 41, 55, 0.04);
}

div[data-testid="metric-container"] label {
    color: #6B7280 !important;
    font-weight: 600;
}

div[data-testid="metric-container"] [data-testid="stMetricValue"] {
    color: #1F2937;
    font-weight: 800;
}

button[data-baseweb="tab"] {
    border-radius: 999px;
    padding: 0.45rem 0.95rem;
    border: 1px solid transparent;
    background: transparent;
}

button[data-baseweb="tab"][aria-selected="true"] {
    background: #E8EFEA;
    border: 1px solid #B7C8BD;
    color: #234035;
}

[data-testid="stChatMessage"] {
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid #E0DDD6;
    border-radius: 18px;
    padding: 0.35rem;
    box-shadow: 0 6px 18px rgba(31, 41, 55, 0.04);
}

div[data-baseweb="select"] > div,
div[data-testid="stTextInputRootElement"] > div,
div[data-testid="stDateInputField"] {
    border-radius: 12px !important;
}

.stButton > button,
.stDownloadButton > button {
    background: #4F6D5E;
    color: white;
    border: none;
    border-radius: 12px;
    padding: 0.55rem 1rem;
    font-weight: 600;
}

.stButton > button:hover,
.stDownloadButton > button:hover {
    background: #3F594D;
    color: white;
}

div[data-testid="stAlert"] {
    border-radius: 14px;
    border: 1px solid #D8D6CF;
}
</style>
""", unsafe_allow_html=True)


def mock_backend(prompt, mode, branch, offline_mode):
    if mode == "TDY":
        return {
            "route": "travel",
            "answer": (
                "I identified this as a TDY planning request. "
                "I would retrieve regulation context, combine cached per diem data, "
                "and generate a compliant travel estimate."
            ),
            "summary": "Travel workflow prepared with retrieval and cached API context.",
            "citations": [
                {"source": "JTR", "section": "Paragraph placeholder", "text": "Travel entitlement citation placeholder"},
                {"source": "GSA", "section": "Per diem cache", "text": "Cached rate lookup placeholder"}
            ],
            "form": {"ready": True, "name": "DA1610.pdf", "download_label": "Download DA 1610"},
            "debug": {
                "prompt_profile": "travel",
                "branch_filter": branch,
                "offline_mode": offline_mode,
                "retrieval_used": True,
                "cached_api_used": True,
                "llm_mode": "single_call"
            }
        }
    elif mode == "Regulations":
        return {
            "route": "regs",
            "answer": (
                "I identified this as a regulation lookup request. "
                "I would retrieve the most relevant policy passages and answer with citations."
            ),
            "summary": "Regulation retrieval workflow prepared.",
            "citations": [
                {"source": "Policy docs", "section": "Section placeholder", "text": "Regulation citation placeholder"}
            ],
            "form": {"ready": False, "name": "", "download_label": ""},
            "debug": {
                "prompt_profile": "regs",
                "branch_filter": branch,
                "offline_mode": offline_mode,
                "retrieval_used": True,
                "cached_api_used": False,
                "llm_mode": "single_call"
            }
        }
    elif mode == "Leave":
        return {
            "route": "leave",
            "answer": (
                "I identified this as a leave workflow request. "
                "I would retrieve leave policy context and prepare the leave form output if needed."
            ),
            "summary": "Leave workflow prepared with retrieval-backed answer generation.",
            "citations": [
                {"source": "AR 600-8-10", "section": "Section placeholder", "text": "Leave policy citation placeholder"}
            ],
            "form": {"ready": True, "name": "DA31.pdf", "download_label": "Download DA 31"},
            "debug": {
                "prompt_profile": "leave",
                "branch_filter": branch,
                "offline_mode": offline_mode,
                "retrieval_used": True,
                "cached_api_used": False,
                "llm_mode": "single_call"
            }
        }
    else:
        return {
            "route": "forms",
            "answer": (
                "I identified this as a form generation request. "
                "I would assemble the required fields and produce a PDF output."
            ),
            "summary": "Form generation workflow prepared.",
            "citations": [
                {"source": "Form template", "section": "Field mapping", "text": "Form mapping placeholder"}
            ],
            "form": {"ready": True, "name": "output_form.pdf", "download_label": "Download generated form"},
            "debug": {
                "prompt_profile": "forms",
                "branch_filter": branch,
                "offline_mode": offline_mode,
                "retrieval_used": False,
                "cached_api_used": False,
                "llm_mode": "single_call"
            }
        }


with st.sidebar:
    st.header("Control Panel")
    mode = st.selectbox("Request type", ["TDY", "Regulations", "Leave", "Form Fill"])
    branch = st.selectbox("Branch filter", ["All", "Army", "Navy", "Air Force"])
    offline_mode = st.toggle("Offline mode", value=True)
    if st.button("Clear chat"):
        st.session_state.messages = []
        st.session_state.last_result = {
            "route": "travel",
            "summary": "No request submitted yet.",
            "citations": [],
            "form": {"ready": False, "name": "", "download_label": ""},
            "debug": {}
        }
        st.rerun()

st.markdown("""
<div class="dl-hero">
    <div class="dl-kicker">GenAI.mil Track • Hackathon Demo</div>
    <div class="dl-title">Duty Line</div>
    <div class="dl-subtitle">
        AI-powered military admin assistant for TDY planning, regulation lookup,
        leave workflows, and form generation.
    </div>
</div>
""", unsafe_allow_html=True)

if "messages" not in st.session_state:
    st.session_state.messages = []

if "last_result" not in st.session_state:
    st.session_state.last_result = {
        "route": "travel",
        "summary": "No request submitted yet.",
        "citations": [],
        "form": {"ready": False, "name": "", "download_label": ""},
        "debug": {}
    }

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

prompt = st.chat_input("Ask about TDY, regulations, leave, or form generation...")

if prompt:
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    result = mock_backend(prompt, mode, branch, offline_mode)
    assistant_text = result["answer"]

    st.session_state.messages.append({"role": "assistant", "content": assistant_text})
    st.session_state.last_result = result

    with st.chat_message("assistant"):
        st.markdown(assistant_text)

st.divider()

c1, c2, c3 = st.columns(3)
c1.metric("Task Profile", st.session_state.last_result.get("route", "N/A").upper())
c2.metric("Retrieval", "Enabled")
c3.metric("Form Output", "Ready" if st.session_state.last_result.get("form", {}).get("ready") else "No")

overview_tab, citations_tab, form_tab, debug_tab = st.tabs(["Answer", "Sources", "Form Output", "Pipeline Debug"])

with overview_tab:
    st.info(st.session_state.last_result["summary"])

with citations_tab:
    citations = st.session_state.last_result["citations"]
    if citations:
        for item in citations:
            st.markdown(f"- **{item['source']}** | {item['section']} — {item['text']}")
    else:
        st.write("No citations yet.")

with form_tab:
    form_data = st.session_state.last_result["form"]
    if form_data["ready"]:
        st.success("Form output is available.")
        st.download_button(
            form_data["download_label"],
            data="Placeholder generated form content",
            file_name=form_data["name"]
        )
    else:
        st.write("No form output for this request.")

with debug_tab:
    st.json(st.session_state.last_result["debug"])
