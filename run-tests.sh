#!/bin/bash

# Test Runner Script for Smart File Organizer

echo "================================"
echo "Smart File Organizer Test Suite"
echo "================================"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run tests
run_test() {
    echo -e "\n${YELLOW}Running $1...${NC}"
    $2
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $1 passed${NC}"
    else
        echo -e "${RED}✗ $1 failed${NC}"
        exit 1
    fi
}

# Check for test type argument
TEST_TYPE=${1:-"all"}

case $TEST_TYPE in
    backend)
        run_test "Backend Unit Tests" "npx jest --config=jest.config.js test/backend"
        ;;
    frontend)
        run_test "Frontend Component Tests" "npx vitest run"
        ;;
    integration)
        run_test "Integration Tests" "npx jest --config=jest.config.js test/integration"
        ;;
    coverage)
        echo -e "${YELLOW}Generating coverage reports...${NC}"
        npx jest --coverage --config=jest.config.js
        npx vitest run --coverage
        echo -e "${GREEN}Coverage reports generated in ./coverage${NC}"
        ;;
    watch)
        echo -e "${YELLOW}Starting test watcher...${NC}"
        npx vitest watch
        ;;
    ui)
        echo -e "${YELLOW}Opening Vitest UI...${NC}"
        npx vitest --ui
        ;;
    all)
        run_test "Backend Unit Tests" "npx jest --config=jest.config.js test/backend"
        run_test "Frontend Component Tests" "npx vitest run"
        run_test "Integration Tests" "npx jest --config=jest.config.js test/integration"
        echo -e "\n${GREEN}All tests passed successfully!${NC}"
        ;;
    *)
        echo "Usage: ./run-tests.sh [backend|frontend|integration|coverage|watch|ui|all]"
        echo "  backend     - Run backend unit tests"
        echo "  frontend    - Run frontend component tests"
        echo "  integration - Run integration tests"
        echo "  coverage    - Generate coverage reports"
        echo "  watch       - Start test watcher"
        echo "  ui          - Open Vitest UI"
        echo "  all         - Run all tests (default)"
        exit 1
        ;;
esac