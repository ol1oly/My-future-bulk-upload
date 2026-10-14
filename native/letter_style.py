"""Checks generated cover-letter text for wording that reads as machine-written.

Word lists come from word-frequency studies of LLM text (Kobak et al. 2024, "excess vocabulary"; Liang et al. 2024)
and recruiter / career-office guidance (e.g. stock openers and closers). Each hit is a signal, not proof, so the host
asks Claude to rewrite once and then shows any remaining issue to the student instead of blocking.
"""

import re

BANNED_EN = [
    "delve", "delving", "tapestry", "testament", "pivotal", "intricate", "meticulous", "commendable",
    "showcase", "showcasing", "underscore", "underscores", "realm", "landscape", "embark", "foster", "leverage",
    "harness", "seamless", "synergy", "robust", "honed", "spearheaded", "invaluable", "unwavering",
    "furthermore", "moreover", "in today's fast-paced", "ever-evolving", "i am excited to", "i'm excited to",
    "i am thrilled", "passionate about", "passionate", "i am confident that", "align with", "aligns perfectly",
    "eager to contribute", "make a meaningful impact", "unique blend", "proven track record",
    "i am writing to express", "thank you for considering my application", "dynamic team", "cutting-edge",
]
BANNED_FR = [
    "je suis passionné par", "je suis passionnée par", "passionné", "passionnée", "n'hésitez pas",
    "dans un monde en constante évolution", "en constante évolution", "dynamisme et rigueur",
    "je suis convaincu que", "je suis convaincue que", "mettre à profit", "plus-value", "valeur ajoutée",
    "relever de nouveaux défis", "s'inscrit parfaitement", "en adéquation avec", "atout majeur",
    "fort de mon expérience", "forte de mon expérience", "de surcroît", "incontournable",
]

PROMPT_RULES = (
    "Write like a capable student writing to a real person. Use plain, concrete words and sentences of varied length. "
    "Back every claim with a specific fact (project, tool, number, outcome). Do not use em or en dashes, 'not only... "
    "but also', rhetorical questions, or stock openers and closers such as 'I am excited to apply' or 'thank you for "
    "considering my application'. Do not call yourself passionate, dynamic or detail-oriented; show it with what you "
    "did. Do not start sentences with 'Furthermore', 'Moreover' or 'Additionally'. Be direct and slightly understated. "
    "In French, apply the same rules and avoid 'je suis passionné(e) par', 'n'hésitez pas' and 'en constante évolution'. "
    "Never use these words or phrases: "
)


def _norm(text):
    return str(text or "").replace("’", "'").lower()


def prompt_rules(language="en"):
    banned = BANNED_FR if language == "fr" else BANNED_EN
    return PROMPT_RULES + ", ".join(f'"{w}"' for w in banned) + "."


def issues(text, language="en"):
    """Return a list of short descriptions of tells found in the text (empty list = clean)."""
    found = []
    norm = _norm(text)
    for word in (BANNED_FR if language == "fr" else BANNED_EN):
        if re.search(r"(?<![\w-])" + re.escape(word) + r"(?![\w-])", norm):
            found.append(f'uses "{word}"')
    if re.search(r"[—–]| -- ", text or ""):
        found.append("uses a long dash")
    if re.search(r"\bnot only\b.{0,80}\bbut( also)?\b", norm) or re.search(r"\bnon seulement\b.{0,80}\bmais( aussi)?\b", norm):
        found.append('uses "not only ... but also"')
    if re.search(r"\?\s*$", (text or "").strip()) or re.match(r"\s*(have you ever|what if|imagine|in a world)\b", norm):
        found.append("rhetorical question or opener")
    if re.search(r"(^|[.!?]\s+)(furthermore|moreover|additionally|in conclusion|ultimately|par ailleurs|en outre),", norm):
        found.append("formulaic transition at the start of a sentence")
    return found


def clean_dashes(text):
    """Replace long dashes with commas, the most common harmless fix."""
    return re.sub(r"\s*[—–]\s*", ", ", str(text or ""))
