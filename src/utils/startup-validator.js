/**
 * Startup Validator - Ensures all critical dependencies and files exist
 * Prevents runtime errors from missing packages or configurations
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class StartupValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Run all validation checks
   */
  async validate() {
    console.log('🔍 [Startup Validator] Running system checks...\n');

    await this.checkNodePackages();
    await this.checkPythonPackages();
    await this.checkRequiredFiles();
    await this.checkRequiredDirs();
    await this.checkFrontendBuild();
    
    return this.report();
  }

  /**
   * Check critical Node.js packages
   */
  async checkNodePackages() {
    console.log('📦 Checking Node.js packages...');
    
    const requiredPackages = [
      'express',
      'sequelize',
      'koa',
      'koa-router',
      'pdfplumber',
      'python-docx',
      'openpyxl'
    ];

    for (const pkg of requiredPackages) {
      try {
        require.resolve(pkg);
        console.log(`  ✓ ${pkg}`);
      } catch (error) {
        this.errors.push(`Missing Node package: ${pkg}`);
        console.log(`  ✗ ${pkg} - MISSING`);
      }
    }
  }

  /**
   * Check critical Python packages
   */
  async checkPythonPackages() {
    console.log('\n🐍 Checking Python packages...');
    
    const requiredPackages = [
      'pdfplumber',
      'docx',
      'openpyxl',
      'pandas',
      'xerparser',
      'PyPDF2',
      'pypdf'
    ];

    for (const pkg of requiredPackages) {
      try {
        // Map package names to their import names
        const importName = {
          'python-docx': 'docx',
          'PyPDF2': 'PyPDF2',
          'pypdf': 'pypdf',
          'xerparser': 'xerparser'
        }[pkg] || pkg;

        execSync(`python3 -c "import ${importName}"`, { 
          stdio: 'pipe',
          encoding: 'utf-8' 
        });
        console.log(`  ✓ ${pkg}`);
      } catch (error) {
        this.errors.push(`Missing Python package: ${pkg}`);
        console.log(`  ✗ ${pkg} - MISSING`);
      }
    }

    // Special check for PyP6XER (installs as xerparser)
    try {
      execSync('python3 -c "from xerparser.reader import Reader"', { 
        stdio: 'pipe',
        encoding: 'utf-8' 
      });
      console.log(`  ✓ PyP6XER (xerparser.reader.Reader)`);
    } catch (error) {
      this.errors.push('Missing PyP6XER Reader API (xerparser.reader.Reader)');
      console.log(`  ✗ PyP6XER Reader - MISSING`);
    }
  }

  /**
   * Check required files exist
   */
  async checkRequiredFiles() {
    console.log('\n📄 Checking required files...');
    
    const requiredFiles = [
      'src/utils/fileAnalyzer.js',
      'src/agent/auto-reply/index.js',
      'src/agent/AgenticAgent.js',
      'src/tools/P6XerTool.js',
      'package.json',
      '.env'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join('/app', file);
      try {
        await fs.access(filePath);
        console.log(`  ✓ ${file}`);
      } catch (error) {
        if (file === '.env') {
          this.warnings.push(`Optional file missing: ${file}`);
          console.log(`  ⚠ ${file} - MISSING (optional)`);
        } else {
          this.errors.push(`Required file missing: ${file}`);
          console.log(`  ✗ ${file} - MISSING`);
        }
      }
    }
  }

  /**
   * Check required directories exist
   */
  async checkRequiredDirs() {
    console.log('\n📁 Checking required directories...');
    
    const requiredDirs = [
      'workspace',
      'data',
      'src',
      'frontend',
      'public'
    ];

    for (const dir of requiredDirs) {
      const dirPath = path.join('/app', dir);
      try {
        const stats = await fs.stat(dirPath);
        if (stats.isDirectory()) {
          console.log(`  ✓ ${dir}/`);
        } else {
          this.errors.push(`Path exists but is not a directory: ${dir}`);
          console.log(`  ✗ ${dir}/ - NOT A DIRECTORY`);
        }
      } catch (error) {
        this.errors.push(`Required directory missing: ${dir}`);
        console.log(`  ✗ ${dir}/ - MISSING`);
      }
    }
  }

  /**
   * Check frontend build assets
   */
  async checkFrontendBuild() {
    console.log('\n🎨 Checking frontend build...');
    
    const publicDir = '/app/public';
    
    try {
      const files = await fs.readdir(publicDir);
      const hasIndexHtml = files.includes('index.html');
      const hasAssets = files.includes('assets');
      
      if (hasIndexHtml) {
        console.log('  ✓ index.html exists');
      } else {
        this.warnings.push('Frontend build may be incomplete: missing index.html');
        console.log('  ⚠ index.html - MISSING');
      }

      if (hasAssets) {
        const assetsPath = path.join(publicDir, 'assets');
        const assetFiles = await fs.readdir(assetsPath);
        const jsFiles = assetFiles.filter(f => f.endsWith('.js'));
        const cssFiles = assetFiles.filter(f => f.endsWith('.css'));
        
        console.log(`  ✓ assets/ (${jsFiles.length} JS, ${cssFiles.length} CSS)`);
      } else {
        this.warnings.push('Frontend build may be incomplete: missing assets/');
        console.log('  ⚠ assets/ - MISSING');
      }
    } catch (error) {
      this.warnings.push('Could not check frontend build');
      console.log('  ⚠ Could not access public/ directory');
    }
  }

  /**
   * Generate validation report
   */
  report() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 STARTUP VALIDATION REPORT');
    console.log('='.repeat(60));

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ All checks passed! System is ready.\n');
      return { success: true, errors: [], warnings: [] };
    }

    if (this.errors.length > 0) {
      console.log('\n❌ CRITICAL ERRORS:');
      this.errors.forEach(err => console.log(`   - ${err}`));
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.warnings.forEach(warn => console.log(`   - ${warn}`));
    }

    console.log('\n' + '='.repeat(60));

    if (this.errors.length > 0) {
      console.log('❌ System validation FAILED. Please fix critical errors before starting.\n');
      return { success: false, errors: this.errors, warnings: this.warnings };
    } else {
      console.log('⚠️  System validation passed with warnings. Proceeding...\n');
      return { success: true, errors: [], warnings: this.warnings };
    }
  }
}

/**
 * Run validation if called directly
 */
if (require.main === module) {
  const validator = new StartupValidator();
  validator.validate().then(result => {
    if (!result.success) {
      process.exit(1);
    }
  }).catch(error => {
    console.error('Validation error:', error);
    process.exit(1);
  });
}

module.exports = StartupValidator;
