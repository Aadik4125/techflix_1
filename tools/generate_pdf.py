from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch

INPUT = 'docs/PROJECT_OVERVIEW.md'
OUTPUT = 'docs/project_overview.pdf'

styles = getSampleStyleSheet()
try:
    styles.add(ParagraphStyle(name='Heading1', fontSize=18, leading=22, spaceAfter=12, spaceBefore=12))
except KeyError:
    pass
try:
    styles.add(ParagraphStyle(name='Heading2', fontSize=14, leading=18, spaceAfter=8, spaceBefore=8))
except KeyError:
    pass
try:
    styles.add(ParagraphStyle(name='Body', fontSize=11, leading=14))
except KeyError:
    pass

def md_to_flowables(text):
    flow = []
    buf = []

    def flush_buf():
        if buf:
            flow.append(Paragraph(' '.join(buf), styles['Body']))
            flow.append(Spacer(1, 6))
            buf.clear()

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            flush_buf()
            continue
        if line.startswith('# '):
            flush_buf()
            flow.append(Paragraph(line[2:].strip(), styles['Heading1']))
            continue
        if line.startswith('## '):
            flush_buf()
            flow.append(Paragraph(line[3:].strip(), styles['Heading2']))
            continue
        # simple list handling
        if line.startswith('- '):
            buf.append('• ' + line[2:].strip())
        else:
            buf.append(line)
    flush_buf()
    return flow


def build_pdf():
    with open(INPUT, 'r', encoding='utf-8') as f:
        md = f.read()

    doc = SimpleDocTemplate(OUTPUT, pagesize=letter,
                            rightMargin=inch/1.25, leftMargin=inch/1.25,
                            topMargin=inch/1.0, bottomMargin=inch/1.0)
    flow = md_to_flowables(md)
    doc.build(flow)
    print('Wrote', OUTPUT)

if __name__ == '__main__':
    build_pdf()
