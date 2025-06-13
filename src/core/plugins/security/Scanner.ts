import { Plugin, PluginManifest } from '@/core/types/plugin'
import { logger } from '@/core/lib/utils/logger'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'

export interface ScanResult {
  pluginId: string
  pluginPath: string
  passed: boolean
  score: number // 0-100
  riskLevel: RiskLevel
  issues: SecurityIssue[]
  recommendations: string[]
  scanDuration: number
  timestamp: Date
}

export interface SecurityIssue {
  type: IssueType
  severity: IssueSeverity
  message: string
  file?: string
  line?: number
  code?: string
  recommendation?: string
  cwe?: string
  details?: Record<string, any>
}

export enum RiskLevel {
  VERY_LOW = 'very_low',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum IssueType {
  MALWARE = 'malware',
  VULNERABILITY = 'vulnerability',
  SUSPICIOUS_CODE = 'suspicious_code',
  PERMISSION_ABUSE = 'permission_abuse',
  UNSAFE_PRACTICE = 'unsafe_practice',
  DEPENDENCY_RISK = 'dependency_risk',
  OBFUSCATION = 'obfuscation',
  NETWORK_ACTIVITY = 'network_activity',
  FILE_ACCESS = 'file_access',
  EVAL_USAGE = 'eval_usage'
}

export enum IssueSeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ScannerConfig {
  enabled: boolean
  scanOnInstall: boolean
  scanOnUpdate: boolean
  scanInterval: number // hours
  enableVirusScanning: boolean
  enableVulnerabilityCheck: boolean
  enableCodeAnalysis: boolean
  enablePermissionAudit: boolean
  quarantineThreshold: number // risk score
  maxFileSize: number // bytes
  allowedFileTypes: string[]
  blockedPatterns: string[]
  trustedDomains: string[]
  customRules: SecurityRule[]
}

export interface SecurityRule {
  name: string
  description: string
  pattern: string | RegExp
  severity: IssueSeverity
  fileTypes?: string[]
  enabled: boolean
}

export class PluginScanner {
  private static instance: PluginScanner
  private config: ScannerConfig
  private scanHistory: Map<string, ScanResult[]> = new Map()
  private knownVulnerabilities: Map<string, VulnerabilityRecord> = new Map()
  private malwareSignatures: Set<string> = new Set()

  private constructor(config: ScannerConfig) {
    this.config = config
    this.initializeVulnerabilityDatabase()
    this.initializeMalwareSignatures()
  }

  public static getInstance(config?: ScannerConfig): PluginScanner {
    if (!PluginScanner.instance) {
      if (!config) {
        throw new Error('Scanner config required for first initialization')
      }
      PluginScanner.instance = new PluginScanner(config)
    }
    return PluginScanner.instance
  }

  /**
   * Scan plugin for security issues
   */
  public async scanPlugin(plugin: Plugin): Promise<ScanResult> {
    const startTime = Date.now()
    
    logger.info('Starting plugin security scan', {
      pluginId: plugin.id,
      pluginPath: plugin.installPath
    })

    const result: ScanResult = {
      pluginId: plugin.id,
      pluginPath: plugin.installPath,
      passed: false,
      score: 0,
      riskLevel: RiskLevel.LOW,
      issues: [],
      recommendations: [],
      scanDuration: 0,
      timestamp: new Date()
    }

    try {
      // 1. File system scan
      await this.scanFileSystem(plugin.installPath, result)

      // 2. Manifest analysis
      await this.scanManifest(plugin.manifest, result)

      // 3. Code analysis
      await this.scanCode(plugin.installPath, result)

      // 4. Dependency analysis
      await this.scanDependencies(plugin.manifest, result)

      // 5. Permission audit
      await this.scanPermissions(plugin.manifest, result)

      // 6. Malware detection
      if (this.config.enableVirusScanning) {
        await this.scanMalware(plugin.installPath, result)
      }

      // 7. Vulnerability check
      if (this.config.enableVulnerabilityCheck) {
        await this.checkVulnerabilities(plugin, result)
      }

      // Calculate final score and risk level
      this.calculateRiskScore(result)

      // Store scan result
      this.storeScanResult(plugin.id, result)

      result.scanDuration = Date.now() - startTime
      result.passed = result.riskLevel !== RiskLevel.CRITICAL

      logger.info('Plugin security scan completed', {
        pluginId: plugin.id,
        passed: result.passed,
        score: result.score,
        riskLevel: result.riskLevel,
        issueCount: result.issues.length,
        duration: result.scanDuration
      })

      return result
    } catch (error) {
      logger.error('Plugin security scan failed', {
        pluginId: plugin.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })

      result.issues.push({
        type: IssueType.VULNERABILITY,
        severity: IssueSeverity.HIGH,
        message: `Scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        recommendation: 'Review plugin manually before installation'
      })

      result.riskLevel = RiskLevel.HIGH
      result.passed = false
      result.scanDuration = Date.now() - startTime

      return result
    }
  }

  /**
   * Get scan history for plugin
   */
  public getScanHistory(pluginId: string): ScanResult[] {
    return this.scanHistory.get(pluginId) || []
  }

  /**
   * Get latest scan result
   */
  public getLatestScanResult(pluginId: string): ScanResult | null {
    const history = this.getScanHistory(pluginId)
    return history.length > 0 ? history[history.length - 1] : null
  }

  /**
   * Check if plugin is safe to install
   */
  public isPluginSafe(pluginId: string): boolean {
    const latest = this.getLatestScanResult(pluginId)
    return latest ? latest.passed : false
  }

  /**
   * Get security summary
   */
  public getSecuritySummary(): {
    totalScanned: number
    passedScans: number
    failedScans: number
    criticalIssues: number
    highRiskPlugins: string[]
    recentScans: ScanResult[]
  } {
    const allResults: ScanResult[] = []
    this.scanHistory.forEach(results => allResults.push(...results))

    const passedScans = allResults.filter(r => r.passed).length
    const criticalIssues = allResults.reduce(
      (count, r) => count + r.issues.filter(i => i.severity === IssueSeverity.CRITICAL).length,
      0
    )
    const highRiskPlugins = allResults
      .filter(r => r.riskLevel === RiskLevel.HIGH || r.riskLevel === RiskLevel.CRITICAL)
      .map(r => r.pluginId)

    const recentScans = allResults
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10)

    return {
      totalScanned: allResults.length,
      passedScans,
      failedScans: allResults.length - passedScans,
      criticalIssues,
      highRiskPlugins,
      recentScans
    }
  }

  /**
   * Update scanner configuration
   */
  public updateConfig(newConfig: Partial<ScannerConfig>): void {
    this.config = { ...this.config, ...newConfig }
    logger.info('Scanner configuration updated', { config: this.config })
  }

  // Private scanning methods
  private async scanFileSystem(pluginPath: string, result: ScanResult): Promise<void> {
    try {
      const files = await this.getAllFiles(pluginPath)
      
      for (const file of files) {
        const stats = await fs.stat(file)
        
        // Check file size
        if (stats.size > this.config.maxFileSize) {
          result.issues.push({
            type: IssueType.SUSPICIOUS_CODE,
            severity: IssueSeverity.MEDIUM,
            message: `Large file detected: ${path.basename(file)} (${stats.size} bytes)`,
            file,
            recommendation: 'Review large files for potential issues'
          })
        }

        // Check file extension
        const ext = path.extname(file).toLowerCase()
        if (!this.config.allowedFileTypes.includes(ext)) {
          result.issues.push({
            type: IssueType.SUSPICIOUS_CODE,
            severity: IssueSeverity.HIGH,
            message: `Unauthorized file type: ${ext}`,
            file,
            recommendation: 'Remove unauthorized file types'
          })
        }
      }
    } catch (error) {
      result.issues.push({
        type: IssueType.VULNERABILITY,
        severity: IssueSeverity.MEDIUM,
        message: `File system scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        recommendation: 'Ensure plugin files are accessible'
      })
    }
  }

  private async scanManifest(manifest: PluginManifest, result: ScanResult): Promise<void> {
    // Check required fields
    const requiredFields = ['name', 'version', 'author', 'description']
    requiredFields.forEach(field => {
      if (!(field in manifest) || !manifest[field as keyof PluginManifest]) {
        result.issues.push({
          type: IssueType.SUSPICIOUS_CODE,
          severity: IssueSeverity.MEDIUM,
          message: `Missing required manifest field: ${field}`,
          recommendation: 'Ensure manifest has all required fields'
        })
      }
    })

    // Check for suspicious permissions
    if (manifest.permissions) {
      const dangerousPermissions = manifest.permissions.filter(p => p.dangerous)
      if (dangerousPermissions.length > 0) {
        result.issues.push({
          type: IssueType.PERMISSION_ABUSE,
          severity: IssueSeverity.HIGH,
          message: `Plugin requests ${dangerousPermissions.length} dangerous permissions`,
          details: { permissions: dangerousPermissions.map((p: { name: any }) => p.name) },
          recommendation: 'Review dangerous permissions carefully'
        })
      }
    }

    // Check dependencies
    if (manifest.dependencies) {
      const externalDeps = manifest.dependencies.filter((d: { type: string }) => d.type === 'npm')
      if (externalDeps.length > 10) {
        result.issues.push({
          type: IssueType.DEPENDENCY_RISK,
          severity: IssueSeverity.MEDIUM,
          message: `Plugin has many external dependencies (${externalDeps.length})`,
          recommendation: 'Review external dependencies for security risks'
        })
      }
    }
  }

  private async scanCode(pluginPath: string, result: ScanResult): Promise<void> {
    const jsFiles = await this.getJavaScriptFiles(pluginPath)
    
    for (const file of jsFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8')
        await this.analyzeCode(content, file, result)
      } catch (error) {
        result.issues.push({
          type: IssueType.VULNERABILITY,
          severity: IssueSeverity.LOW,
          message: `Could not read file: ${path.basename(file)}`,
          file,
          recommendation: 'Ensure file is readable'
        })
      }
    }
  }

  private async analyzeCode(content: string, file: string, result: ScanResult): Promise<void> {
    const lines = content.split('\n')
    
    // Check for dangerous patterns
    const dangerousPatterns = [
      { pattern: /eval\s*\(/g, message: 'Use of eval() detected', severity: IssueSeverity.HIGH },
      { pattern: /Function\s*\(/g, message: 'Dynamic function creation detected', severity: IssueSeverity.MEDIUM },
      { pattern: /document\.write/g, message: 'Use of document.write detected', severity: IssueSeverity.MEDIUM },
      { pattern: /innerHTML\s*=/g, message: 'Use of innerHTML detected', severity: IssueSeverity.LOW },
      { pattern: /require\s*\(\s*['"]child_process['"]/, message: 'Child process access detected', severity: IssueSeverity.HIGH },
      { pattern: /require\s*\(\s*['"]fs['"]/, message: 'File system access detected', severity: IssueSeverity.MEDIUM },
      { pattern: /XMLHttpRequest|fetch\s*\(/g, message: 'Network request detected', severity: IssueSeverity.MEDIUM },
      { pattern: /crypto\./g, message: 'Cryptographic operations detected', severity: IssueSeverity.LOW }
    ]

    dangerousPatterns.forEach(({ pattern, message, severity }) => {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length
        result.issues.push({
          type: IssueType.SUSPICIOUS_CODE,
          severity,
          message,
          file,
          line: lineNumber,
          code: lines[lineNumber - 1]?.trim(),
          recommendation: 'Review this code for security implications'
        })
      }
    })

    // Check for obfuscation
    if (this.isObfuscated(content)) {
      result.issues.push({
        type: IssueType.OBFUSCATION,
        severity: IssueSeverity.HIGH,
        message: 'Obfuscated code detected',
        file,
        recommendation: 'Obfuscated code may hide malicious functionality'
      })
    }

    // Check for blocked patterns
    this.config.blockedPatterns.forEach(pattern => {
      if (content.includes(pattern)) {
        result.issues.push({
          type: IssueType.SUSPICIOUS_CODE,
          severity: IssueSeverity.HIGH,
          message: `Blocked pattern detected: ${pattern}`,
          file,
          recommendation: 'Remove blocked patterns'
        })
      }
    })
  }

  private async scanDependencies(manifest: PluginManifest, result: ScanResult): Promise<void> {
    if (!manifest.dependencies) return

    for (const dep of manifest.dependencies) {
      if (dep.type === 'npm') {
        // Check against known vulnerable packages
        const vulnerability = this.knownVulnerabilities.get(`${dep.name}@${dep.version}`)
        if (vulnerability) {
          result.issues.push({
            type: IssueType.VULNERABILITY,
            severity: this.mapCvssToSeverity(vulnerability.cvss),
            message: `Vulnerable dependency: ${dep.name}@${dep.version}`,
            cwe: vulnerability.cwe,
            details: { vulnerability },
            recommendation: `Update to version ${vulnerability.fixedVersion || 'latest'}`
          })
        }
      }
    }
  }

  private async scanPermissions(manifest: PluginManifest, result: ScanResult): Promise<void> {
    if (!manifest.permissions) return

    const permissionAnalysis = {
      networkAccess: false,
      fileAccess: false,
      systemAccess: false,
      databaseAccess: false
    }

    manifest.permissions.forEach((permission: { scope: any }) => {
      switch (permission.scope) {
        case 'network':
          permissionAnalysis.networkAccess = true
          break
        case 'file':
          permissionAnalysis.fileAccess = true
          break
        case 'system':
          permissionAnalysis.systemAccess = true
          break
        case 'database':
          permissionAnalysis.databaseAccess = true
          break
      }
    })

    // Flag suspicious permission combinations
    if (permissionAnalysis.networkAccess && permissionAnalysis.fileAccess) {
      result.issues.push({
        type: IssueType.PERMISSION_ABUSE,
        severity: IssueSeverity.MEDIUM,
        message: 'Plugin requests both network and file access',
        recommendation: 'Verify legitimate need for both permissions'
      })
    }

    if (permissionAnalysis.systemAccess && permissionAnalysis.databaseAccess) {
      result.issues.push({
        type: IssueType.PERMISSION_ABUSE,
        severity: IssueSeverity.HIGH,
        message: 'Plugin requests both system and database access',
        recommendation: 'High-risk permission combination detected'
      })
    }
  }

  private async scanMalware(pluginPath: string, result: ScanResult): Promise<void> {
    const files = await this.getAllFiles(pluginPath)
    
    for (const file of files) {
      const content = await fs.readFile(file)
      const hash = crypto.createHash('sha256').update(content).digest('hex')
      
      if (this.malwareSignatures.has(hash)) {
        result.issues.push({
          type: IssueType.MALWARE,
          severity: IssueSeverity.CRITICAL,
          message: `Malware detected: ${path.basename(file)}`,
          file,
          details: { hash },
          recommendation: 'Quarantine plugin immediately'
        })
      }
    }
  }

  private async checkVulnerabilities(plugin: Plugin, result: ScanResult): Promise<void> {
    // Check plugin version against known vulnerabilities
    const pluginKey = `${plugin.name}@${plugin.version}`
    const vulnerability = this.knownVulnerabilities.get(pluginKey)
    
    if (vulnerability) {
      result.issues.push({
        type: IssueType.VULNERABILITY,
        severity: this.mapCvssToSeverity(vulnerability.cvss),
        message: `Plugin has known vulnerability: ${vulnerability.description}`,
        cwe: vulnerability.cwe,
        details: { vulnerability },
        recommendation: `Update to version ${vulnerability.fixedVersion || 'latest'}`
      })
    }
  }

  // Helper methods
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = []
    
    async function traverse(currentPath: string) {
      const entries = await fs.readdir(currentPath, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name)
        
        if (entry.isDirectory()) {
          await traverse(fullPath)
        } else {
          files.push(fullPath)
        }
      }
    }
    
    await traverse(dirPath)
    return files
  }

  private async getJavaScriptFiles(dirPath: string): Promise<string[]> {
    const allFiles = await this.getAllFiles(dirPath)
    return allFiles.filter(file => {
      const ext = path.extname(file).toLowerCase()
      return ['.js', '.ts', '.jsx', '.tsx'].includes(ext)
    })
  }

  private isObfuscated(code: string): boolean {
    // Simple obfuscation detection heuristics
    const suspiciousPatterns = [
      /\\x[0-9a-fA-F]{2}/g, // Hex encoded strings
      /\\u[0-9a-fA-F]{4}/g, // Unicode escapes
      /eval\s*\(\s*unescape/g, // Eval with unescape
      /String\.fromCharCode/g, // Character code conversion
      /atob\s*\(/g, // Base64 decoding
    ]

    let suspiciousCount = 0
    suspiciousPatterns.forEach(pattern => {
      const matches = code.match(pattern)
      if (matches) {
        suspiciousCount += matches.length
      }
    })

    // Check for high density of suspicious patterns
    const codeLength = code.length
    const density = suspiciousCount / (codeLength / 1000) // per 1000 chars
    
    return density > 5 || suspiciousCount > 20
  }

  private calculateRiskScore(result: ScanResult): void {
    let score = 100 // Start with perfect score
    
    result.issues.forEach(issue => {
      switch (issue.severity) {
        case IssueSeverity.CRITICAL:
          score -= 40
          break
        case IssueSeverity.HIGH:
          score -= 20
          break
        case IssueSeverity.MEDIUM:
          score -= 10
          break
        case IssueSeverity.LOW:
          score -= 5
          break
        case IssueSeverity.INFO:
          score -= 1
          break
      }
    })

    result.score = Math.max(0, score)
    
    // Determine risk level
    if (result.score >= 90) {
      result.riskLevel = RiskLevel.VERY_LOW
    } else if (result.score >= 70) {
      result.riskLevel = RiskLevel.LOW
    } else if (result.score >= 50) {
      result.riskLevel = RiskLevel.MEDIUM
    } else if (result.score >= 30) {
      result.riskLevel = RiskLevel.HIGH
    } else {
      result.riskLevel = RiskLevel.CRITICAL
    }

    // Generate recommendations
    result.recommendations = this.generateRecommendations(result)
  }

  private generateRecommendations(result: ScanResult): string[] {
    const recommendations: string[] = []
    
    if (result.issues.some(i => i.type === IssueType.MALWARE)) {
      recommendations.push('Quarantine plugin immediately - malware detected')
    }
    
    if (result.issues.some(i => i.severity === IssueSeverity.CRITICAL)) {
      recommendations.push('Do not install - critical security issues found')
    }
    
    if (result.issues.some(i => i.type === IssueType.VULNERABILITY)) {
      recommendations.push('Update dependencies to fix known vulnerabilities')
    }
    
    if (result.issues.some(i => i.type === IssueType.PERMISSION_ABUSE)) {
      recommendations.push('Review requested permissions carefully')
    }
    
    if (result.issues.some(i => i.type === IssueType.OBFUSCATION)) {
      recommendations.push('Request source code review for obfuscated sections')
    }
    
    if (result.riskLevel === RiskLevel.MEDIUM) {
      recommendations.push('Consider additional security review before installation')
    }
    
    return recommendations
  }

  private mapCvssToSeverity(cvss: number): IssueSeverity {
    if (cvss >= 9.0) return IssueSeverity.CRITICAL
    if (cvss >= 7.0) return IssueSeverity.HIGH
    if (cvss >= 4.0) return IssueSeverity.MEDIUM
    if (cvss >= 0.1) return IssueSeverity.LOW
    return IssueSeverity.INFO
  }

  private storeScanResult(pluginId: string, result: ScanResult): void {
    const history = this.scanHistory.get(pluginId) || []
    history.push(result)
    
    // Keep only last 10 results
    if (history.length > 10) {
      history.shift()
    }
    
    this.scanHistory.set(pluginId, history)
  }

  private initializeVulnerabilityDatabase(): void {
    // In a real implementation, this would load from a vulnerability database
    // For now, we'll use a simple in-memory store
    this.knownVulnerabilities.set('lodash@4.17.20', {
      cve: 'CVE-2021-23337',
      cwe: 'CWE-78',
      description: 'Command injection in lodash',
      cvss: 7.2,
      fixedVersion: '4.17.21'
    })
  }

  private initializeMalwareSignatures(): void {
    // In a real implementation, this would load malware signatures from a database
    // For now, we'll use a simple set of known bad hashes
    this.malwareSignatures.add('d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2')
  }
}

interface VulnerabilityRecord {
  cve: string
  cwe: string
  description: string
  cvss: number
  fixedVersion?: string
}