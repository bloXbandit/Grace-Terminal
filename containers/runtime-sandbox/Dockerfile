# Start from the original lemon runtime sandbox image
FROM hexdolemonai/lemon-runtime-sandbox:latest

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install Python packages for document processing
RUN pip install --no-cache-dir \
    pypdf \
    pypdf2 \
    python-docx \
    openpyxl \
    xlsxwriter \
    pandas \
    numpy \
    pillow \
    pdfplumber \
    reportlab \
    matplotlib \
    seaborn \
    requests \
    beautifulsoup4 \
    lxml

# Copy our customized files
COPY containers/runtime-sandbox/action_execution_server.js /chataa/code/chataa/action_execution_server.js
COPY containers/runtime-sandbox/terminal_run.js /chataa/code/chataa/terminal_run.js
COPY containers/runtime-sandbox/tools.js /chataa/code/chataa/utils/tools.js

# Ensure proper permissions
RUN chmod +x /chataa/code/chataa/action_execution_server.js && \
    chmod +x /chataa/code/chataa/terminal_run.js && \
    chmod +x /chataa/code/chataa/utils/tools.js

# Set the command to run action_execution_server
CMD ["node", "/chataa/code/chataa/action_execution_server.js", "--port=32811"]
