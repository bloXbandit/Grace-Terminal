#!/bin/bash
# Runtime Sandbox Setup Script - Ensures sandbox container is properly configured
# This runs after grace-app builds to keep sandbox in sync

set -e  # Exit on error

echo "🔧 Runtime Sandbox Setup Starting..."
echo "=================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
NC='\033[0m' # No Color

SANDBOX_NAME="lemon-runtime-sandbox"
SANDBOX_IMAGE="grace-runtime-sandbox:custom"
SANDBOX_PORT="32811"
NETWORK_NAME="graceai_default"

# Python modules to install (sync with grace-app Dockerfile)
PYTHON_MODULES=(
    "python-docx"
    "pandas"
    "openpyxl"
    "xlsxwriter"
    "reportlab"
    "python-pptx"
    "Pillow"
    "matplotlib"
    "numpy"
    "PyP6XER"
    "PyPDF2"
    "pypdf"
    "requests"
    "beautifulsoup4"
    "lxml"
    "seaborn"
    "plotly"
    "scikit-learn"
    "pdfplumber"
    "pytesseract"
    "pdf2image"
    "pdfminer.six"
    "cryptography"
)

# Check if container exists
if docker ps -a --format '{{.Names}}' | grep -q "^${SANDBOX_NAME}$"; then
    echo -e "${YELLOW}⚠️  Existing sandbox container found${NC}"
    echo "Stopping and removing old container..."
    docker stop $SANDBOX_NAME 2>/dev/null || true
    docker rm $SANDBOX_NAME 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Old container removed"
fi

# Check if network exists
if ! docker network ls --format '{{.Name}}' | grep -q "^${NETWORK_NAME}$"; then
    echo -e "${RED}✗${NC} Network '$NETWORK_NAME' not found"
    echo "Creating network..."
    docker network create $NETWORK_NAME
    echo -e "${GREEN}✓${NC} Network created"
fi

# Check if workspace directory exists
if [ ! -d "./workspace" ]; then
    echo -e "${YELLOW}⚠️  Workspace directory not found${NC}"
    echo "Creating workspace directory..."
    mkdir -p ./workspace
    echo -e "${GREEN}✓${NC} Workspace created"
fi

echo -e "\n${BLUE}Starting runtime sandbox container...${NC}"
docker run -d \
    --name $SANDBOX_NAME \
    --network $NETWORK_NAME \
    -p ${SANDBOX_PORT}:${SANDBOX_PORT} \
    -v "$PWD/workspace:/workspace" \
    $SANDBOX_IMAGE

echo -e "${GREEN}✓${NC} Container started"

# Wait for container to be ready
echo -e "\n${BLUE}Waiting for container to initialize...${NC}"
sleep 5

# Check if container is running
if docker ps --format '{{.Names}}' | grep -q "^${SANDBOX_NAME}$"; then
    echo -e "${GREEN}✓${NC} Container is running"
else
    echo -e "${RED}✗${NC} Container failed to start"
    echo "Check logs: docker logs $SANDBOX_NAME"
    exit 1
fi

# Install Python modules
echo -e "\n${BLUE}Installing Python modules...${NC}"
echo "This may take a minute..."

# Join array into space-separated string
MODULES_STRING="${PYTHON_MODULES[*]}"

docker exec $SANDBOX_NAME pip3 install --break-system-packages $MODULES_STRING > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Python modules installed successfully"
else
    echo -e "${RED}✗${NC} Failed to install Python modules"
    echo "Trying again with verbose output..."
    docker exec $SANDBOX_NAME pip3 install --break-system-packages $MODULES_STRING
fi

# Verify critical modules
echo -e "\n${BLUE}Verifying critical modules...${NC}"
VERIFY_CMD="python3 -c \"import openpyxl, pandas, reportlab, docx; print('OK')\""
VERIFY_RESULT=$(docker exec $SANDBOX_NAME sh -c "$VERIFY_CMD" 2>&1)

if echo "$VERIFY_RESULT" | grep -q "OK"; then
    echo -e "${GREEN}✓${NC} Critical modules verified"
else
    echo -e "${YELLOW}⚠️  Module verification failed${NC}"
    echo "Result: $VERIFY_RESULT"
fi

# Test connection from grace-app (if running)
if docker ps --format '{{.Names}}' | grep -q "^grace-app$"; then
    echo -e "\n${BLUE}Testing connection from grace-app...${NC}"
    TEST_RESULT=$(docker exec grace-app curl -s -o /dev/null -w "%{http_code}" \
        -X POST http://host.docker.internal:${SANDBOX_PORT}/execute_action \
        -H "Content-Type: application/json" \
        -d '{"action":{"type":"test"},"uuid":"setup-test"}' 2>/dev/null || echo "000")
    
    if [ "$TEST_RESULT" = "200" ]; then
        echo -e "${GREEN}✓${NC} Connection test successful (HTTP 200)"
    else
        echo -e "${YELLOW}⚠️  Connection test failed (HTTP $TEST_RESULT)${NC}"
    fi
fi

# Summary
echo -e "\n=================================="
echo "📊 SETUP SUMMARY"
echo "=================================="
echo -e "Container Name:  ${GREEN}$SANDBOX_NAME${NC}"
echo -e "Network:         ${GREEN}$NETWORK_NAME${NC}"
echo -e "Port Mapping:    ${GREEN}$SANDBOX_PORT:$SANDBOX_PORT${NC}"
echo -e "Workspace:       ${GREEN}./workspace:/workspace${NC}"
echo -e "Python Modules:  ${GREEN}${#PYTHON_MODULES[@]} installed${NC}"
echo ""
echo -e "${GREEN}✅ Runtime sandbox is ready!${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:    docker logs $SANDBOX_NAME"
echo "  Restart:      docker restart $SANDBOX_NAME"
echo "  Enter shell:  docker exec -it $SANDBOX_NAME bash"
