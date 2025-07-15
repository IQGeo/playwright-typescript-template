pipeline {
    agent any

    environment {
        PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.52.0-noble'
        WORK_DIR = '/app'
        REPORT_DIR = 'reports/playwright'
    }

    stages {
        stage('Safe Clean Workspace') {
            steps {
                sh '''
                    docker run --rm -v "$PWD":/app -w /app alpine sh -c "rm -rf * .??*"
                '''
            }
        }

        stage('Checkout') {
            steps {
                deleteDir()
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                sh """
                    docker pull ${PLAYWRIGHT_IMAGE}
                    docker run --rm \
                        -v "${env.WORKSPACE}:${WORK_DIR}" \
                        -w ${WORK_DIR} \
                        ${PLAYWRIGHT_IMAGE} bash -c '
                            npm ci
                            npx playwright install
                        '
                """
            }
        }

        stage('Run Tests') {
            steps {
                def injectCredsIfExists = {
                        def creds = [:]
                        creds.URL = ''
                        creds.USERNAME = ''
                        creds.PASSWORD = ''

                        try {
                            withCredentials([
                               string(credentialsId: 'TEST_URL', variable: 'TEST_URL'),
                                usernamePassword(credentialsId: 'TEST_CREDENTIALS', usernameVariable: 'TEST_USERNAME', passwordVariable: 'TEST_PASSWORD')
                            ]) {
                                creds.URL = env.'TEST_URL'
                                creds.USERNAME = env.'TEST_USERNAME'
                                creds.PASSWORD = env.'TEST_PASSWORD'
                                echo "Injected credentials for ${prefix}"
                            }
                        } catch (ignored) {
                            echo "No credentials found for ${prefix}, using default values"
                        }
                        return creds
                }

                catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                    script {
                        def creds = injectCredsIfExists()
                        try {
                            sh """
                        docker run --rm \
                            -v "${env.WORKSPACE}:${WORK_DIR}" \
                            -w ${WORK_DIR} \
                            -e JENKINS=true \
                            -e ENVIRONMENT="${params.ENVIRONMENT}" \
                            -e PLAYWRIGHT_HTML_REPORT_DIR="${REPORT_DIR}/playwright-report" \
                            -e CUSTOM_REPORT_DIR="${REPORT_DIR}" \
                            -e ${prefix}_URL="${creds.URL}" \
                            -e ${prefix}_USERNAME="${creds.USERNAME}" \
                            -e ${prefix}_PASSWORD="${creds.PASSWORD}" \
                            ${PLAYWRIGHT_IMAGE} bash -c '
                                mkdir -p "${REPORT_DIR}"
                                npx playwright test --project=chromium
                            '
                    """
                } finally {
                            archiveArtifacts artifacts: 'test-results/**/*', allowEmptyArchive: true
                        }
                    }
                }
            }
        }

        stage('Publish HTML Report') {
            steps {
                publishHTML(target: [
                    reportName: 'Playwright Report',
                    reportDir: "${env.REPORT_DIR}",
                    reportFiles: 'detailed-report.html',
                    keepAll: true,
                    alwaysLinkToLastBuild: true,
                    allowMissing: false,
                    escapeHtml: false
                ])
            }
        }
    }
}
