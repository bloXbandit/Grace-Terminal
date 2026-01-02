const DigitalTwinService = require('./digital_twin');
const path = require('path');
const fs = require('fs').promises;

/**
 * TwinWebsiteGenerator
 * Generates complete websites with embedded digital twin hosts
 */
class TwinWebsiteGenerator {
  constructor() {
    this.twinService = new DigitalTwinService();
  }

  /**
   * Generate a complete website with embedded digital twin
   * @param {Object} params
   * @param {string} params.type - Website type: 'resume', 'product', 'business'
   * @param {number} params.twin_id - Digital twin ID
   * @param {Object} params.content - Website content
   * @param {number} params.user_id - User ID
   * @param {string} params.conversation_id - Conversation ID
   * @param {string} params.output_dir - Output directory
   * @returns {Promise<Object>} Website data
   */
  async generateWebsite({ type, twin_id, content, user_id, conversation_id, output_dir }) {
    console.log('[TwinWebsite] Generating website:', { type, twin_id });

    // Step 1: Generate scripts for each section
    const scripts = this._generateScripts(type, content);

    // Step 2: Generate twin videos for each section
    console.log('[TwinWebsite] Generating twin videos for sections...');
    const videos = await this.twinService.generateWebsiteVideos({
      twin_id,
      sections: scripts,
      user_id,
      conversation_id,
      output_dir
    });

    // Step 3: Generate website code
    console.log('[TwinWebsite] Generating website code...');
    const websiteCode = this._generateWebsiteCode(type, content, videos);

    // Step 4: Save website files
    console.log('[TwinWebsite] Saving website files...');
    const websitePath = await this._saveWebsite(websiteCode, videos, output_dir);

    console.log('[TwinWebsite] ✅ Website generated:', websitePath);

    return {
      website_path: websitePath,
      videos,
      type,
      url: `/workspace/${path.basename(output_dir)}/twin_website/index.html`
    };
  }

  /**
   * Generate scripts for website sections
   * @private
   */
  _generateScripts(type, content) {
    const templates = {
      resume: [
        {
          name: 'hero',
          script: `Hi, I'm ${content.name || 'John Doe'}. ${content.tagline || 'Welcome to my portfolio.'} Let me show you what I've been working on.`,
          background: 'professional'
        },
        {
          name: 'about',
          script: `A bit about my background: ${content.about || 'I\'m a passionate professional with diverse experience in software development and design.'}`,
          background: 'professional'
        },
        {
          name: 'skills',
          script: `Here are my key skills: ${(content.skills || ['JavaScript', 'Python', 'React', 'Node.js']).join(', ')}. I've developed these through years of hands-on experience.`,
          background: 'professional'
        },
        {
          name: 'contact',
          script: `Interested in working together? ${content.contactMessage || 'Feel free to reach out - I\'d love to hear from you!'}`,
          background: 'professional'
        }
      ],
      product: [
        {
          name: 'hero',
          script: `Welcome! Let me introduce you to ${content.productName || 'our product'}. ${content.tagline || 'The solution you\'ve been looking for.'}`,
          background: 'professional'
        },
        {
          name: 'problem',
          script: `Here's the problem we're solving: ${content.problem || 'Many people struggle with inefficient workflows.'}`,
          background: 'professional'
        },
        {
          name: 'solution',
          script: `And here's how ${content.productName || 'we'} solve it: ${content.solution || 'By streamlining your process and saving you time.'}`,
          background: 'professional'
        },
        {
          name: 'cta',
          script: `Ready to get started? ${content.ctaMessage || 'Sign up today and see the difference!'}`,
          background: 'professional'
        }
      ],
      business: [
        {
          name: 'hero',
          script: `Welcome to ${content.companyName || 'our company'}. ${content.mission || 'We\'re here to help you succeed.'}`,
          background: 'professional'
        },
        {
          name: 'services',
          script: `Here's what we offer: ${content.services || 'Comprehensive solutions tailored to your needs.'}`,
          background: 'professional'
        },
        {
          name: 'contact',
          script: `Let's connect: ${content.contactMessage || 'Reach out to learn how we can help your business grow.'}`,
          background: 'professional'
        }
      ]
    };

    return templates[type] || templates.resume;
  }

  /**
   * Generate website code with twin integration
   * @private
   */
  _generateWebsiteCode(type, content, videos) {
    return {
      html: this._generateHTML(type, content),
      css: this._generateCSS(type),
      js: this._generateJS(type, videos),
      readme: this._generateReadme(type, content)
    };
  }

  /**
   * Generate HTML structure
   * @private
   */
  _generateHTML(type, content) {
    const title = content.title || content.name || 'My Website';
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="styles.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <!-- Hero Section with Digital Twin -->
  <section id="hero" class="hero-section">
    <div class="hero-content">
      <div class="twin-container hero-twin">
        <div class="twin-video-wrapper">
          <video id="hero-video" class="twin-video" autoplay muted loop playsinline>
            <source src="videos/hero.mp4" type="video/mp4">
          </video>
          <div class="twin-glow"></div>
        </div>
      </div>
      <div class="hero-text">
        <h1 class="hero-title">${content.name || 'Welcome'}</h1>
        <p class="hero-subtitle">${content.tagline || 'Explore my work'}</p>
      </div>
    </div>
    <div class="scroll-indicator">
      <span>Scroll to explore</span>
      <div class="scroll-arrow">↓</div>
    </div>
  </section>

  ${this._generateSections(type, content)}

  <!-- Floating Twin Widget -->
  <div id="twin-widget" class="twin-widget">
    <button id="twin-toggle" class="twin-toggle">
      <span class="twin-icon">👤</span>
    </button>
    <div id="twin-panel" class="twin-panel hidden">
      <div class="twin-panel-header">
        <h3>Ask me anything</h3>
        <button id="twin-close" class="twin-close">×</button>
      </div>
      <div class="twin-panel-video">
        <video id="widget-video" class="twin-video" controls>
          <source src="videos/hero.mp4" type="video/mp4">
        </video>
      </div>
      <div class="twin-panel-actions">
        ${this._generateActionButtons(type)}
      </div>
    </div>
  </div>

  <script src="main.js"></script>
</body>
</html>`;
  }

  /**
   * Generate sections based on website type
   * @private
   */
  _generateSections(type, content) {
    const sections = {
      resume: `
  <section id="about" class="section">
    <div class="container">
      <div class="section-twin">
        <video class="twin-video section-video" data-section="about" muted>
          <source src="videos/about.mp4" type="video/mp4">
        </video>
      </div>
      <div class="section-content">
        <h2>About Me</h2>
        <p>${content.about || 'I\'m a passionate professional with diverse experience.'}</p>
      </div>
    </div>
  </section>

  <section id="skills" class="section">
    <div class="container">
      <div class="section-content">
        <h2>Skills</h2>
        <div class="skills-grid">
          ${(content.skills || ['JavaScript', 'Python', 'React', 'Node.js']).map(skill => 
            `<div class="skill-card">${skill}</div>`
          ).join('\n          ')}
        </div>
      </div>
      <div class="section-twin">
        <video class="twin-video section-video" data-section="skills" muted>
          <source src="videos/skills.mp4" type="video/mp4">
        </video>
      </div>
    </div>
  </section>

  <section id="contact" class="section">
    <div class="container">
      <div class="section-twin">
        <video class="twin-video section-video" data-section="contact" muted>
          <source src="videos/contact.mp4" type="video/mp4">
        </video>
      </div>
      <div class="section-content">
        <h2>Get In Touch</h2>
        <p>${content.contactMessage || 'Feel free to reach out!'}</p>
        <div class="contact-buttons">
          <a href="mailto:${content.email || 'hello@example.com'}" class="btn btn-primary">Email Me</a>
          <a href="${content.linkedin || '#'}" class="btn btn-secondary">LinkedIn</a>
        </div>
      </div>
    </div>
  </section>`,
      
      product: `
  <section id="problem" class="section">
    <div class="container">
      <div class="section-content">
        <h2>The Problem</h2>
        <p>${content.problem || 'Many people struggle with inefficient workflows.'}</p>
      </div>
      <div class="section-twin">
        <video class="twin-video section-video" data-section="problem" muted>
          <source src="videos/problem.mp4" type="video/mp4">
        </video>
      </div>
    </div>
  </section>

  <section id="solution" class="section">
    <div class="container">
      <div class="section-twin">
        <video class="twin-video section-video" data-section="solution" muted>
          <source src="videos/solution.mp4" type="video/mp4">
        </video>
      </div>
      <div class="section-content">
        <h2>The Solution</h2>
        <p>${content.solution || 'We streamline your process and save you time.'}</p>
      </div>
    </div>
  </section>

  <section id="cta" class="section">
    <div class="container">
      <div class="section-twin">
        <video class="twin-video section-video" data-section="cta" muted>
          <source src="videos/cta.mp4" type="video/mp4">
        </video>
      </div>
      <div class="section-content">
        <h2>Ready to Get Started?</h2>
        <p>${content.ctaMessage || 'Sign up today!'}</p>
        <a href="#" class="btn btn-primary btn-large">Get Started</a>
      </div>
    </div>
  </section>`,
      
      business: `
  <section id="services" class="section">
    <div class="container">
      <div class="section-content">
        <h2>Our Services</h2>
        <p>${content.services || 'Comprehensive solutions tailored to your needs.'}</p>
      </div>
      <div class="section-twin">
        <video class="twin-video section-video" data-section="services" muted>
          <source src="videos/services.mp4" type="video/mp4">
        </video>
      </div>
    </div>
  </section>

  <section id="contact" class="section">
    <div class="container">
      <div class="section-twin">
        <video class="twin-video section-video" data-section="contact" muted>
          <source src="videos/contact.mp4" type="video/mp4">
        </video>
      </div>
      <div class="section-content">
        <h2>Let's Connect</h2>
        <p>${content.contactMessage || 'Reach out to learn more.'}</p>
        <a href="#" class="btn btn-primary">Contact Us</a>
      </div>
    </div>
  </section>`
    };

    return sections[type] || sections.resume;
  }

  /**
   * Generate action buttons for twin widget
   * @private
   */
  _generateActionButtons(type) {
    const buttons = {
      resume: [
        { label: 'About Me', video: 'about' },
        { label: 'My Skills', video: 'skills' },
        { label: 'Contact', video: 'contact' }
      ],
      product: [
        { label: 'The Problem', video: 'problem' },
        { label: 'Our Solution', video: 'solution' },
        { label: 'Get Started', video: 'cta' }
      ],
      business: [
        { label: 'Our Services', video: 'services' },
        { label: 'Contact Us', video: 'contact' }
      ]
    };

    const typeButtons = buttons[type] || buttons.resume;
    
    return typeButtons.map(btn => 
      `<button class="twin-action-btn" data-video="${btn.video}">${btn.label}</button>`
    ).join('\n        ');
  }

  /**
   * Generate CSS styles
   * @private
   */
  _generateCSS(type) {
    return `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0a0a0a;
  color: #ffffff;
  overflow-x: hidden;
}

/* Hero Section */
.hero-section {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  overflow: hidden;
}

.hero-content {
  display: flex;
  align-items: center;
  gap: 4rem;
  max-width: 1200px;
  padding: 2rem;
  z-index: 1;
}

.twin-container {
  position: relative;
}

.hero-twin .twin-video-wrapper {
  width: 400px;
  height: 400px;
  position: relative;
}

.twin-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.twin-glow {
  position: absolute;
  inset: -20px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  filter: blur(40px);
  opacity: 0.5;
  z-index: -1;
  animation: pulse 3s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.05); }
}

.hero-text {
  flex: 1;
}

.hero-title {
  font-size: 4rem;
  font-weight: 700;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #ffffff, #e0e0e0);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 1.5rem;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.6;
}

.scroll-indicator {
  position: absolute;
  bottom: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: rgba(255, 255, 255, 0.6);
  animation: bounce 2s infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

/* Sections */
.section {
  min-height: 100vh;
  display: flex;
  align-items: center;
  padding: 4rem 2rem;
  position: relative;
}

.section:nth-child(even) {
  background: #0f0f0f;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 4rem;
}

.section-twin {
  flex: 0 0 350px;
}

.section-video {
  width: 350px;
  height: 350px;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(102, 126, 234, 0.3);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.section-video:hover {
  transform: scale(1.05);
  box-shadow: 0 20px 60px rgba(102, 126, 234, 0.5);
}

.section-content {
  flex: 1;
}

.section-content h2 {
  font-size: 3rem;
  margin-bottom: 1.5rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.section-content p {
  font-size: 1.25rem;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 2rem;
}

/* Skills Grid */
.skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
  margin-top: 2rem;
}

.skill-card {
  background: linear-gradient(135deg, #667eea, #764ba2);
  padding: 1.5rem;
  border-radius: 12px;
  text-align: center;
  font-weight: 600;
  transition: transform 0.3s ease;
}

.skill-card:hover {
  transform: translateY(-5px);
}

/* Buttons */
.btn {
  display: inline-block;
  padding: 1rem 2rem;
  border-radius: 8px;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.3s ease;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.btn-large {
  padding: 1.5rem 3rem;
  font-size: 1.25rem;
}

.contact-buttons {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
}

/* Floating Twin Widget */
.twin-widget {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  z-index: 1000;
}

.twin-toggle {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  border: none;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
}

.twin-toggle:hover {
  transform: scale(1.1);
  box-shadow: 0 15px 40px rgba(102, 126, 234, 0.6);
}

.twin-icon {
  font-size: 2rem;
}

.twin-panel {
  position: absolute;
  bottom: 80px;
  right: 0;
  width: 350px;
  background: #1a1a1a;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  transition: all 0.3s ease;
}

.twin-panel.hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(20px);
}

.twin-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #667eea, #764ba2);
}

.twin-panel-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.twin-close {
  background: none;
  border: none;
  color: white;
  font-size: 2rem;
  cursor: pointer;
  line-height: 1;
}

.twin-panel-video {
  padding: 1rem;
}

.twin-panel-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
}

.twin-action-btn {
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
}

.twin-action-btn:hover {
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-color: transparent;
}

/* Responsive */
@media (max-width: 768px) {
  .hero-content {
    flex-direction: column;
    text-align: center;
  }
  
  .hero-title {
    font-size: 2.5rem;
  }
  
  .container {
    flex-direction: column;
  }
  
  .section-content h2 {
    font-size: 2rem;
  }
  
  .twin-panel {
    width: 300px;
  }
}`;
  }

  /**
   * Generate JavaScript for interactivity
   * @private
   */
  _generateJS(type, videos) {
    return `// Digital Twin Website - Interactive Script

// Intersection Observer for section videos
const observerOptions = {
  threshold: 0.5,
  rootMargin: '0px'
};

const videoObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const video = entry.target;
    if (entry.isIntersecting) {
      video.play().catch(err => console.log('Video play failed:', err));
    } else {
      video.pause();
    }
  });
}, observerOptions);

// Observe all section videos
document.querySelectorAll('.section-video').forEach(video => {
  videoObserver.observe(video);
});

// Floating twin widget
const twinToggle = document.getElementById('twin-toggle');
const twinPanel = document.getElementById('twin-panel');
const twinClose = document.getElementById('twin-close');
const widgetVideo = document.getElementById('widget-video');

twinToggle.addEventListener('click', () => {
  twinPanel.classList.toggle('hidden');
  if (!twinPanel.classList.contains('hidden')) {
    widgetVideo.play().catch(err => console.log('Video play failed:', err));
  }
});

twinClose.addEventListener('click', () => {
  twinPanel.classList.add('hidden');
  widgetVideo.pause();
});

// Twin action buttons
document.querySelectorAll('.twin-action-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const videoName = btn.dataset.video;
    widgetVideo.src = \`videos/\${videoName}.mp4\`;
    widgetVideo.play().catch(err => console.log('Video play failed:', err));
  });
});

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// Parallax effect on scroll
let ticking = false;

window.addEventListener('scroll', () => {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      const scrolled = window.pageYOffset;
      const heroTwin = document.querySelector('.hero-twin');
      if (heroTwin) {
        heroTwin.style.transform = \`translateY(\${scrolled * 0.5}px)\`;
      }
      ticking = false;
    });
    ticking = true;
  }
});

console.log('Digital Twin Website loaded successfully! 🤖');`;
  }

  /**
   * Generate README
   * @private
   */
  _generateReadme(type, content) {
    return `# Digital Twin Website

This website was generated by Grace Terminal AI with an embedded digital twin host.

## Features

- ✅ Photorealistic digital twin host
- ✅ Interactive video sections
- ✅ Floating twin widget
- ✅ Smooth animations and 3D effects
- ✅ Fully responsive design

## Structure

\`\`\`
twin_website/
├── index.html          # Main HTML file
├── styles.css          # Styles and animations
├── main.js             # Interactive scripts
├── videos/             # Twin video files
│   ├── hero.mp4
│   ├── about.mp4
│   └── ...
└── README.md           # This file
\`\`\`

## Usage

1. Open \`index.html\` in a web browser
2. Your digital twin will automatically play in the hero section
3. Scroll to see section-specific twin videos
4. Click the floating twin button to interact

## Customization

- Edit \`index.html\` to change content
- Modify \`styles.css\` to adjust colors and layout
- Update \`main.js\` to add new interactions

## Deployment

Deploy to:
- Netlify: Drag and drop the folder
- Vercel: Connect to Git repository
- GitHub Pages: Push to gh-pages branch

---

Generated with ❤️ by Grace Terminal AI
`;
  }

  /**
   * Save website files
   * @private
   */
  async _saveWebsite(websiteCode, videos, output_dir) {
    const websiteDir = path.join(output_dir, 'twin_website');
    const videosDir = path.join(websiteDir, 'videos');
    
    await fs.mkdir(websiteDir, { recursive: true });
    await fs.mkdir(videosDir, { recursive: true });

    // Save HTML, CSS, JS
    await fs.writeFile(path.join(websiteDir, 'index.html'), websiteCode.html);
    await fs.writeFile(path.join(websiteDir, 'styles.css'), websiteCode.css);
    await fs.writeFile(path.join(websiteDir, 'main.js'), websiteCode.js);
    await fs.writeFile(path.join(websiteDir, 'README.md'), websiteCode.readme);

    // Copy video files
    for (const [section, video] of Object.entries(videos)) {
      const destPath = path.join(videosDir, `${section}.mp4`);
      await fs.copyFile(video.path, destPath);
    }

    console.log('[TwinWebsite] Files saved to:', websiteDir);
    return websiteDir;
  }
}

module.exports = TwinWebsiteGenerator;
