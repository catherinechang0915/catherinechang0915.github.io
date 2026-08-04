/* ==========================================================================
   Interactive & Dynamic CMS Scripts
   Theme Switching, Modals, Endorsements, Chat Widget & Dynamic Controls
   ========================================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBeFmo45CtIE4zlt2iPJwr3wqoch-_nlNY",
  authDomain: "catherinechang0915-9ca3f.firebaseapp.com",
  projectId: "catherinechang0915-9ca3f",
  storageBucket: "catherinechang0915-9ca3f.firebasestorage.app",
  messagingSenderId: "920954829584",
  appId: "1:920954829584:web:ecc11f81ac03371aacc395"
};

let firebaseApp, db, auth;
let firebaseInitialized = false;

try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp);
    auth = getAuth(firebaseApp);
    firebaseInitialized = true;
  } else {
    console.warn("Firebase config not set. Dynamic edits will fall back to LocalStorage.");
  }
} catch (e) {
  console.error("Failed to initialize Firebase:", e);
}

// Default clean state template (Catherine/Mogu details removed)
const defaultProfileData = {
  name: "Your Name",
  pronouns: "(pronouns)",
  headline: "Your professional headline goes here...",
  banner: "",
  avatar: "",
  about: "Write a summary about your skills, experience, and interests here.",
  featured: [],
  experience: [],
  education: [],
  skills: [],
  recommendations: [],
  contact: {
    email: "your.email@example.com",
    location: "City, State, Country"
  }
};

let profileData = {};

document.addEventListener('DOMContentLoaded', async () => {
  await loadProfileData();
  renderAll();

  initThemeToggle();
  initConnectButton();
  initFloatingChat();
  initContactModal();
  initExpandableText();
  initAddRecommendationModal();
  initPostLikes();
  initPasswordGate();
  initAdminControls();
  initEditorModal();
});

/* --- DATA PERSISTENCE & LOADING --- */

async function loadProfileData() {
  if (firebaseInitialized) {
    try {
      const docRef = doc(db, "profiles", "user-profile");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        profileData = docSnap.data();
      } else {
        profileData = JSON.parse(JSON.stringify(defaultProfileData));
        await setDoc(docRef, profileData);
      }

      // Fetch recommendations from separate collection
      const q = query(collection(db, "recommendations"), orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);
      profileData.recommendations = [];
      querySnapshot.forEach((doc) => {
        const rec = doc.data();
        rec.id = doc.id; // Save ID for deletion
        profileData.recommendations.push(rec);
      });
      return;
    } catch (err) {
      console.error("Firebase Firestore load failed, falling back to LocalStorage:", err);
    }
  }

  const data = localStorage.getItem('profileData');
  if (data) {
    profileData = JSON.parse(data);
    if (profileData.recommendations && typeof profileData.recommendations === 'object' && !Array.isArray(profileData.recommendations)) {
      profileData.recommendations = profileData.recommendations.received || [];
    }
  } else {
    profileData = JSON.parse(JSON.stringify(defaultProfileData));
  }
}

async function saveProfileData() {
  if (firebaseInitialized) {
    try {
      const docRef = doc(db, "profiles", "user-profile");
      await setDoc(docRef, profileData);
      showToast('Profile saved to Firebase!');
      return;
    } catch (err) {
      console.error("Firebase Firestore save failed, falling back to LocalStorage:", err);
    }
  }

  localStorage.setItem('profileData', JSON.stringify(profileData));
  showToast('Profile saved locally!');
}

/* --- SECURITY & ROLE MANAGEMENT (Two-Tier Password Gate) --- */

function isAdmin() {
  return sessionStorage.getItem('role') === 'admin';
}

function isGuest() {
  return sessionStorage.getItem('role') === 'guest';
}

function isAuthenticated() {
  return sessionStorage.getItem('authenticated') === 'true';
}

async function initPasswordGate() {
  const gate = document.getElementById('passwordGate');
  const form = document.getElementById('passwordForm');
  const input = document.getElementById('pagePasswordInput');
  const errorMsg = document.getElementById('passwordError');
  const lockBtn = document.getElementById('lockProfileBtn');
  const toggleVisibility = document.getElementById('togglePwdVisibility');

  if (!gate || !form) return;

  // Toggle password visibility
  if (toggleVisibility && input) {
    toggleVisibility.addEventListener('click', () => {
      const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
      input.setAttribute('type', type);
      toggleVisibility.textContent = type === 'password' ? '👁️' : '🙈';
    });
  }

  // Monitor Firebase Auth session state change
  if (firebaseInitialized && auth) {
    onAuthStateChanged(auth, (user) => {
      if (user && user.email === 'admin@catherinechang.com') {
        sessionStorage.setItem('role', 'admin');
        sessionStorage.setItem('authenticated', 'true');
        gate.style.display = 'none';
        updateAdminUI();
      } else {
        // If logged out from Firebase, check if guest is active, if not lock
        if (sessionStorage.getItem('role') !== 'guest') {
          sessionStorage.clear();
          gate.style.display = 'flex';
          updateAdminUI();
        }
      }
    });
  } else {
    // If Firebase isn't set up, fall back to LocalStorage session check
    if (isAuthenticated()) {
      gate.style.display = 'none';
      updateAdminUI();
    }
  }

  // Passwords:
  // 1. "guest" -> hash: d8d38e8568ffeb55fce0926bc3f995d2effaa66d495033c93ebcb847e4944c02
  const guestHash = 'd8d38e8568ffeb55fce0926bc3f995d2effaa66d495033c93ebcb847e4944c02';

  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const typedPassword = input.value.trim();
    const typedHash = await sha256(typedPassword);

    // 1. Check if Guest Password
    if (typedHash === guestHash) {
      sessionStorage.setItem('role', 'guest');
      sessionStorage.setItem('authenticated', 'true');
      gate.style.display = 'none';
      updateAdminUI();
      showToast('Unlocked as Guest!');
      return;
    }

    // 2. Check Admin via Firebase Auth (if configured)
    if (firebaseInitialized && auth) {
      try {
        showToast('Verifying Admin credentials...');
        await signInWithEmailAndPassword(auth, "admin@catherinechang.com", typedPassword);
        // Auth state listener above will handle role storage and UI unlocking
        showToast('Authenticated as Admin!');
      } catch (err) {
        console.error("Firebase Login failed:", err);
        errorMsg.textContent = "Incorrect password or authentication error.";
        errorMsg.style.display = 'block';
        input.value = '';
      }
    } else {
      // Offline fallback: if Firebase is not setup, check against local admin hash
      // The default admin password hash when offline is: "admin" -> 0a1ddb9f08702c55b0c1bdc8913b7a6ed8530cc4226fb12fbe78a510b21cdf4d
      const offlineAdminHash = '0a1ddb9f08702c55b0c1bdc8913b7a6ed8530cc4226fb12fbe78a510b21cdf4d';
      if (typedHash === offlineAdminHash) {
        sessionStorage.setItem('role', 'admin');
        sessionStorage.setItem('authenticated', 'true');
        gate.style.display = 'none';
        updateAdminUI();
        showToast('Unlocked as Admin (Offline Fallback)!');
      } else {
        errorMsg.textContent = "Incorrect password. Please try again.";
        errorMsg.style.display = 'block';
        input.value = '';
      }
    }
  });

  // Lock Page Button
  if (lockBtn) {
    lockBtn.addEventListener('click', async () => {
      sessionStorage.clear();
      if (firebaseInitialized && auth) {
        try {
          await signOut(auth);
        } catch (err) {
          console.error("Sign out failed:", err);
        }
      }
      gate.style.display = 'flex';
      updateAdminUI();
      showToast('Profile Locked');
    });
  }
}

// Shows or hides edit buttons based on role
function updateAdminUI() {
  const adminElements = document.querySelectorAll('.admin-only');
  const lockBtn = document.getElementById('lockProfileBtn');

  if (isAdmin()) {
    adminElements.forEach(el => el.style.display = 'inline-block');
    if (lockBtn) {
      lockBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg> Logout (Admin)`;
    }
  } else {
    adminElements.forEach(el => el.style.display = 'none');
    if (lockBtn) {
      lockBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg> Lock Page`;
    }
  }
}

/* --- RENDERING ENGINE --- */

function renderAll() {
  renderHero();
  renderAbout();
  renderFeatured();
  renderExperience();
  renderEducation();
  renderSkills();
  renderRecommendations();
  renderContact();
}

function renderHero() {
  document.getElementById('profileName').innerHTML = escapeHTML(profileData.name) + (isAdmin() ? '<span class="admin-badge">Admin</span>' : '');
  document.getElementById('profilePronouns').textContent = profileData.pronouns ? `(${profileData.pronouns})` : '';
  document.getElementById('profileHeadline').textContent = profileData.headline || '';



  const avatarEl = document.getElementById('profileAvatar');
  if (avatarEl) {
    const fallbackAvatar = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%231e293b"/><circle cx="50" cy="50" r="30" fill="%23475569"/></svg>';
    avatarEl.onerror = () => {
      avatarEl.src = fallbackAvatar;
    };
    if (profileData.avatar) {
      avatarEl.src = profileData.avatar;
    } else {
      avatarEl.src = fallbackAvatar;
    }
  }

  const bannerEl = document.getElementById('profileBanner');
  if (bannerEl) {
    bannerEl.onerror = () => {
      bannerEl.style.opacity = '0'; // Let the CSS background gradient show through
    };
    if (profileData.banner) {
      bannerEl.src = profileData.banner;
      bannerEl.style.opacity = '0.6';
    } else {
      bannerEl.style.opacity = '0'; // Hide the image and use the CSS gradient
    }
  }
}

function renderAbout() {
  const content = document.getElementById('aboutContent');
  if (!content) return;
  content.innerHTML = escapeHTML(profileData.about || '').replace(/\n/g, '<br>');
}

function renderFeatured() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;

  if (!profileData.featured || profileData.featured.length === 0) {
    grid.innerHTML = '<p class="empty-state-text" style="color:var(--text-secondary); font-style:italic; padding:12px;">No featured items added yet.</p>';
    return;
  }

  grid.innerHTML = profileData.featured.map((item, index) => `
    <div class="featured-card">
      <img src="${item.img || 'assets/project1.png'}" alt="Featured Item" class="featured-img">
      <div class="featured-info">
        <div class="featured-type">${escapeHTML(item.type)}</div>
        <div class="featured-title">${escapeHTML(item.title)}</div>
        <div class="featured-desc">${escapeHTML(item.desc)}</div>
        ${isAdmin() ? `
          <div class="edit-card-actions">
            <button class="btn-icon" onclick="openFeaturedEditor(${index})">✏️ Edit</button>
            <button class="btn-icon btn-delete" onclick="deleteFeaturedItem(${index})">🗑️ Delete</button>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function renderExperience() {
  const list = document.getElementById('experienceList');
  if (!list) return;

  if (!profileData.experience || profileData.experience.length === 0) {
    list.innerHTML = '<p class="empty-state-text" style="color:var(--text-secondary); font-style:italic; padding:12px;">No experience listed yet.</p>';
    return;
  }

  list.innerHTML = profileData.experience.map((exp, index) => {
    const skillsList = (exp.skills || []).map(skill => `<span class="skill-pill">${escapeHTML(skill)}</span>`).join('');
    return `
      <div class="timeline-item" style="border-bottom: ${index < profileData.experience.length - 1 ? '1px solid var(--border-color)' : 'none'}; padding-bottom: 20px; margin-bottom: 20px;">
        <div class="company-logo">${escapeHTML(exp.logo || 'EP')}</div>
        <div style="flex-grow:1;">
          <div class="timeline-role">${escapeHTML(exp.role)}</div>
          <div class="timeline-company">${escapeHTML(exp.company)}</div>
          <div class="timeline-period">${escapeHTML(exp.period)}</div>
          <div class="timeline-location">${escapeHTML(exp.location)}</div>
          <div class="timeline-desc">${escapeHTML(exp.desc || '').replace(/\n/g, '<br>')}</div>
          ${skillsList ? `<div class="skill-pills" style="margin-top:10px;">${skillsList}</div>` : ''}
          ${isAdmin() ? `
            <div class="edit-card-actions">
              <button class="btn-icon" onclick="openExperienceEditor(${index})">✏️ Edit</button>
              <button class="btn-icon btn-delete" onclick="deleteExperienceItem(${index})">🗑️ Delete</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderEducation() {
  const list = document.getElementById('educationList');
  if (!list) return;

  if (!profileData.education || profileData.education.length === 0) {
    list.innerHTML = '<p class="empty-state-text" style="color:var(--text-secondary); font-style:italic; padding:12px;">No education listed yet.</p>';
    return;
  }

  list.innerHTML = profileData.education.map((edu, index) => `
    <div class="timeline-item" style="border-bottom: ${index < profileData.education.length - 1 ? '1px solid var(--border-color)' : 'none'}; padding-bottom: 20px; margin-bottom: 20px;">
      <div class="company-logo">${escapeHTML(edu.logo || 'ED')}</div>
      <div style="flex-grow:1;">
        <div class="timeline-role">${escapeHTML(edu.school)}</div>
        <div class="timeline-company">${escapeHTML(edu.degree)}</div>
        <div class="timeline-period">${escapeHTML(edu.period)}</div>
        <div class="timeline-desc">${escapeHTML(edu.desc || '').replace(/\n/g, '<br>')}</div>
        ${isAdmin() ? `
          <div class="edit-card-actions">
            <button class="btn-icon" onclick="openEducationEditor(${index})">✏️ Edit</button>
            <button class="btn-icon btn-delete" onclick="deleteEducationItem(${index})">🗑️ Delete</button>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function renderSkills() {
  const list = document.getElementById('skillsList');
  if (!list) return;

  if (!profileData.skills || profileData.skills.length === 0) {
    list.innerHTML = '<p class="empty-state-text" style="color:var(--text-secondary); font-style:italic; padding:12px;">No skills added yet.</p>';
    return;
  }

  list.innerHTML = profileData.skills.map((skill, index) => `
    <div class="skill-item">
      <div class="skill-info">
        <div class="skill-name">${escapeHTML(skill.name)}</div>
        <div class="skill-endorsements">Endorsed by <span class="endorse-count-${index}">${skill.endorsements || 0}</span> colleagues</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="btn-endorse" onclick="endorseSkill(${index}, this)">+ Endorse</button>
        ${isAdmin() ? `
          <button class="btn-icon" style="padding: 4px 6px;" onclick="openSkillEditor(${index})">✏️</button>
          <button class="btn-icon btn-delete" style="padding: 4px 6px;" onclick="deleteSkillItem(${index})">🗑️</button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function renderRecommendations() {
  const container = document.getElementById('recReceivedView');
  if (!container) return;

  const recs = profileData.recommendations || [];

  if (recs.length === 0) {
    container.innerHTML = '<p style="color:var(--text-secondary); font-style:italic; padding:12px;">No recommendations yet.</p>';
  } else {
    container.innerHTML = recs.map((rec, index) => `
      <div class="rec-card">
        <div class="rec-author">
          <div class="rec-author-avatar">${escapeHTML(rec.avatar || 'U')}</div>
          <div style="flex-grow:1;">
            <div style="font-weight:700;">${escapeHTML(rec.author)}</div>
            <div class="rec-author-title">${escapeHTML(rec.title)}</div>
          </div>
          ${isAdmin() ? `<button class="btn-icon btn-delete" onclick="deleteRec(${index})">🗑️</button>` : ''}
        </div>
        <div class="about-text">"${escapeHTML(rec.text)}"</div>
      </div>
    `).join('');
  }
}

function renderContact() {
  const container = document.getElementById('contactModalContent');
  if (!container) return;

  const email = profileData.contact ? profileData.contact.email : 'your.email@example.com';
  const location = profileData.contact ? profileData.contact.location : 'City, Country';

  container.innerHTML = `
    <div class="contact-item">
      <svg class="contact-icon" viewBox="0 0 24 24">
        <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
      </svg>
      <div>
        <div class="contact-label">Email</div>
        <a href="mailto:${escapeHTML(email)}" class="contact-value">${escapeHTML(email)}</a>
      </div>
    </div>



    <div class="contact-item">
      <svg class="contact-icon" viewBox="0 0 24 24">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
      </svg>
      <div>
        <div class="contact-label">Location</div>
        <div class="contact-value">${escapeHTML(location)}</div>
      </div>
    </div>
  `;
}

function endorseSkill(index, button) {
  if (button.classList.contains('endorsed')) {
    button.classList.remove('endorsed');
    button.textContent = '+ Endorse';
    profileData.skills[index].endorsements = Math.max(0, (profileData.skills[index].endorsements || 0) - 1);
    showToast('Endorsement removed');
  } else {
    button.classList.add('endorsed');
    button.textContent = 'Endorsed ✓';
    profileData.skills[index].endorsements = (profileData.skills[index].endorsements || 0) + 1;
    showToast('Skill endorsed!');
  }

  const span = document.querySelector(`.endorse-count-${index}`);
  if (span) span.textContent = profileData.skills[index].endorsements;

  saveProfileData();
}

/* --- ADMIN EDITING UI CONTROLS --- */

let currentEditMode = "";
let currentEditIndex = -1;

function initAdminControls() {
  const editIntroBtn = document.getElementById('editIntroBtn');
  const editAboutBtn = document.getElementById('editAboutBtn');
  const editContactBtn = document.getElementById('editContactBtn');
  const addFeaturedBtn = document.getElementById('addFeaturedBtn');
  const addExperienceBtn = document.getElementById('addExperienceBtn');
  const addEducationBtn = document.getElementById('addEducationBtn');
  const addSkillBtn = document.getElementById('addSkillBtn');
  const editAvatarBtn = document.getElementById('editAvatarBtn');
  const editBannerBtn = document.getElementById('editBannerBtn');
  const avatarInput = document.getElementById('avatarFileInput');
  const bannerInput = document.getElementById('bannerFileInput');

  if (editIntroBtn) editIntroBtn.addEventListener('click', openIntroEditor);
  if (editAboutBtn) editAboutBtn.addEventListener('click', openAboutEditor);
  if (editContactBtn) editContactBtn.addEventListener('click', openContactEditor);
  if (addFeaturedBtn) addFeaturedBtn.addEventListener('click', () => openFeaturedEditor(-1));
  if (addExperienceBtn) addExperienceBtn.addEventListener('click', () => openExperienceEditor(-1));
  if (addEducationBtn) addEducationBtn.addEventListener('click', () => openEducationEditor(-1));
  if (addSkillBtn) addSkillBtn.addEventListener('click', () => openSkillEditor(-1));

  if (editAvatarBtn) {
    editAvatarBtn.addEventListener('click', () => {
      if (!firebaseInitialized) {
        const url = prompt("Configure Firebase to upload files. Enter Avatar Image URL for now:", profileData.avatar);
        if (url !== null) {
          profileData.avatar = url;
          saveProfileData();
          renderHero();
        }
      } else if (avatarInput) {
        avatarInput.click();
      }
    });
  }

  if (editBannerBtn) {
    editBannerBtn.addEventListener('click', () => {
      if (!firebaseInitialized) {
        const url = prompt("Configure Firebase to upload files. Enter Banner Image URL for now:", profileData.banner);
        if (url !== null) {
          profileData.banner = url;
          saveProfileData();
          renderHero();
        }
      } else if (bannerInput) {
        bannerInput.click();
      }
    });
  }

  if (avatarInput) {
    avatarInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        showToast('Uploading avatar...');
        const avatarUrl = await uploadImage(file, 'avatars');
        profileData.avatar = avatarUrl;
        await saveProfileData();
        renderHero();
        showToast('Avatar updated!');
      } catch (err) {
        console.error("Avatar upload failed:", err);
        showToast('Storage upload failed. Fallback to URL prompt.');
        const url = prompt("Firebase Storage is disabled. Please enter/paste the Avatar Image URL instead:", profileData.avatar);
        if (url !== null) {
          profileData.avatar = url.trim();
          saveProfileData();
          renderHero();
        }
      }
    });
  }

  if (bannerInput) {
    bannerInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        showToast('Uploading banner...');
        const bannerUrl = await uploadImage(file, 'banners');
        profileData.banner = bannerUrl;
        await saveProfileData();
        renderHero();
        showToast('Banner updated!');
      } catch (err) {
        console.error("Banner upload failed:", err);
        showToast('Storage upload failed. Fallback to URL prompt.');
        const url = prompt("Firebase Storage is disabled. Please enter/paste the Banner Image URL instead:", profileData.banner);
        if (url !== null) {
          profileData.banner = url.trim();
          saveProfileData();
          renderHero();
        }
      }
    });
  }
}

async function uploadImage(file, folder) {
  if (!firebaseInitialized) throw new Error("Firebase not initialized");
  const storage = getStorage(firebaseApp);
  const filename = `${folder}/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, filename);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}

/* --- GENERIC FORM MODAL ENGINE --- */

function initEditorModal() {
  const modal = document.getElementById('editorModal');
  const form = document.getElementById('editorForm');
  const closeBtn = document.getElementById('closeEditorModal');

  if (!modal || !form || !closeBtn) return;

  closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    saveEditorFormValues();
    modal.classList.remove('open');
  });
}

function showModal(title, fieldsHTML, mode, index = -1) {
  const modal = document.getElementById('editorModal');
  const titleEl = document.getElementById('editorModalTitle');
  const container = document.getElementById('editorFormFields');

  if (!modal || !titleEl || !container) return;

  titleEl.textContent = title;
  container.innerHTML = fieldsHTML;
  currentEditMode = mode;
  currentEditIndex = index;

  modal.classList.add('open');
}

// Dynamically generate form inputs for modals
function makeInput(label, id, value, type = "text", placeholder = "", required = true) {
  return `
    <div>
      <label style="display:block; font-weight:600; font-size:12px; margin-bottom:4px; color:var(--text-primary);">${label}</label>
      <input type="${type}" id="${id}" value="${escapeHTML(value || '')}" placeholder="${placeholder}" ${required ? 'required' : ''}
        style="width:100%; padding:8px 12px; border:1px solid var(--border-color); border-radius:var(--radius-sm); font-size:14px; background:var(--bg-card); color:var(--text-primary);">
    </div>
  `;
}

function makeTextarea(label, id, value, rows = 4, placeholder = "", required = true) {
  return `
    <div>
      <label style="display:block; font-weight:600; font-size:12px; margin-bottom:4px; color:var(--text-primary);">${label}</label>
      <textarea id="${id}" rows="${rows}" placeholder="${placeholder}" ${required ? 'required' : ''}
        style="width:100%; padding:8px 12px; border:1px solid var(--border-color); border-radius:var(--radius-sm); font-size:14px; font-family:inherit; background:var(--bg-card); color:var(--text-primary); resize:vertical;">${escapeHTML(value || '')}</textarea>
    </div>
  `;
}

function openIntroEditor() {
  const fields = `
    ${makeInput("Name", "editName", profileData.name)}
    ${makeInput("Pronouns (Optional)", "editPronouns", profileData.pronouns, "text", "e.g. (she/her)", false)}
    ${makeInput("Headline", "editHeadline", profileData.headline)}
    ${makeInput("Avatar Image URL (Optional)", "editAvatar", profileData.avatar, "url", "e.g. https://domain.com/avatar.png", false)}
    ${makeInput("Banner Image URL (Optional)", "editBanner", profileData.banner, "url", "e.g. https://domain.com/banner.png", false)}
  `;
  showModal("Edit Intro Header", fields, "intro");
}

function openAboutEditor() {
  const fields = makeTextarea("About Summary", "editAboutText", profileData.about, 8);
  showModal("Edit About Section", fields, "about");
}

function openContactEditor() {
  const fields = `
    ${makeInput("Email", "editContactEmail", profileData.contact.email, "email")}
    ${makeInput("Location", "editContactLocation", profileData.contact.location)}
  `;
  showModal("Edit Contact Information", fields, "contact");
}

function openFeaturedEditor(index) {
  const item = index >= 0 ? profileData.featured[index] : { type: "", title: "", desc: "", img: "" };
  const fields = `
    ${makeInput("Item Type", "editFeatType", item.type, "text", "e.g. Project • GitHub")}
    ${makeInput("Title", "editFeatTitle", item.title)}
    ${makeTextarea("Description", "editFeatDesc", item.desc, 4)}
    ${makeInput("Image URL (Optional)", "editFeatImg", item.img, "text", "assets/project1.png", false)}
  `;
  showModal(index >= 0 ? "Edit Featured Item" : "Add Featured Item", fields, "featured", index);
}

function openExperienceEditor(index) {
  const item = index >= 0 ? profileData.experience[index] : { role: "", company: "", period: "", location: "", desc: "", logo: "", skills: [] };
  const fields = `
    ${makeInput("Job Title", "editExpRole", item.role)}
    ${makeInput("Company & Mode", "editExpCompany", item.company, "text", "e.g. NextGen Tech • Full-time")}
    ${makeInput("Employment Period", "editExpPeriod", item.period, "text", "e.g. Jan 2023 - Present")}
    ${makeInput("Location", "editExpLocation", item.location, "text", "e.g. San Francisco, California")}
    ${makeTextarea("Description", "editExpDesc", item.desc, 5)}
    ${makeInput("Logo Initials", "editExpLogo", item.logo, "text", "e.g. NT (Max 2 Letters)", false)}
    ${makeInput("Key Skills (Comma separated)", "editExpSkills", (item.skills || []).join(", "), "text", "e.g. React, Python", false)}
  `;
  showModal(index >= 0 ? "Edit Job Experience" : "Add Job Experience", fields, "experience", index);
}

function openEducationEditor(index) {
  const item = index >= 0 ? profileData.education[index] : { school: "", degree: "", period: "", desc: "", logo: "" };
  const fields = `
    ${makeInput("School Name", "editEduSchool", item.school)}
    ${makeInput("Degree & Subject", "editEduDegree", item.degree, "text", "e.g. Bachelor of Science, Computer Science")}
    ${makeInput("Enrollment Period", "editEduPeriod", item.period, "text", "e.g. 2014 - 2018")}
    ${makeTextarea("Description & Activities", "editEduDesc", item.desc, 4)}
    ${makeInput("Logo Initials", "editEduLogo", item.logo, "text", "e.g. UC (Max 2 Letters)", false)}
  `;
  showModal(index >= 0 ? "Edit Education Record" : "Add Education Record", fields, "education", index);
}

function openSkillEditor(index) {
  const item = index >= 0 ? profileData.skills[index] : { name: "", endorsements: 0 };
  const fields = `
    ${makeInput("Skill Name", "editSkillName", item.name)}
    ${makeInput("Initial Endorsements Count", "editSkillEndorse", item.endorsements, "number")}
  `;
  showModal(index >= 0 ? "Edit Skill" : "Add Skill", fields, "skill", index);
}

function saveEditorFormValues() {
  if (currentEditMode === "intro") {
    profileData.name = document.getElementById('editName').value.trim();
    profileData.pronouns = document.getElementById('editPronouns').value.trim();
    profileData.headline = document.getElementById('editHeadline').value.trim();
    profileData.avatar = document.getElementById('editAvatar').value.trim();
    profileData.banner = document.getElementById('editBanner').value.trim();
    renderHero();
  } else if (currentEditMode === "about") {
    profileData.about = document.getElementById('editAboutText').value.trim();
    renderAbout();
  } else if (currentEditMode === "contact") {
    profileData.contact = {
      email: document.getElementById('editContactEmail').value.trim(),
      location: document.getElementById('editContactLocation').value.trim()
    };
    renderContact();
  } else if (currentEditMode === "featured") {
    const newItem = {
      type: document.getElementById('editFeatType').value.trim(),
      title: document.getElementById('editFeatTitle').value.trim(),
      desc: document.getElementById('editFeatDesc').value.trim(),
      img: document.getElementById('editFeatImg').value.trim() || 'assets/project1.png'
    };
    if (currentEditIndex >= 0) {
      profileData.featured[currentEditIndex] = newItem;
    } else {
      if (!profileData.featured) profileData.featured = [];
      profileData.featured.push(newItem);
    }
    renderFeatured();
  } else if (currentEditMode === "experience") {
    const skillsVal = document.getElementById('editExpSkills').value.trim();
    const skillsArray = skillsVal ? skillsVal.split(',').map(s => s.trim()).filter(Boolean) : [];

    const newItem = {
      role: document.getElementById('editExpRole').value.trim(),
      company: document.getElementById('editExpCompany').value.trim(),
      period: document.getElementById('editExpPeriod').value.trim(),
      location: document.getElementById('editExpLocation').value.trim(),
      desc: document.getElementById('editExpDesc').value.trim(),
      logo: (document.getElementById('editExpLogo').value.trim() || 'EP').substring(0, 2).toUpperCase(),
      skills: skillsArray
    };

    if (currentEditIndex >= 0) {
      profileData.experience[currentEditIndex] = newItem;
    } else {
      if (!profileData.experience) profileData.experience = [];
      profileData.experience.push(newItem);
    }
    renderExperience();
  } else if (currentEditMode === "education") {
    const newItem = {
      school: document.getElementById('editEduSchool').value.trim(),
      degree: document.getElementById('editEduDegree').value.trim(),
      period: document.getElementById('editEduPeriod').value.trim(),
      desc: document.getElementById('editEduDesc').value.trim(),
      logo: (document.getElementById('editEduLogo').value.trim() || 'ED').substring(0, 2).toUpperCase()
    };

    if (currentEditIndex >= 0) {
      profileData.education[currentEditIndex] = newItem;
    } else {
      if (!profileData.education) profileData.education = [];
      profileData.education.push(newItem);
    }
    renderEducation();
  } else if (currentEditMode === "skill") {
    const newItem = {
      name: document.getElementById('editSkillName').value.trim(),
      endorsements: parseInt(document.getElementById('editSkillEndorse').value, 10) || 0
    };

    if (currentEditIndex >= 0) {
      profileData.skills[currentEditIndex] = newItem;
    } else {
      if (!profileData.skills) profileData.skills = [];
      profileData.skills.push(newItem);
    }
    renderSkills();
  }

  saveProfileData();
}

/* --- DELETE BUTTON ACTIONS --- */

window.deleteFeaturedItem = function (index) {
  if (confirm("Delete this featured item?")) {
    profileData.featured.splice(index, 1);
    saveProfileData();
    renderFeatured();
  }
};

window.deleteExperienceItem = function (index) {
  if (confirm("Delete this job experience?")) {
    profileData.experience.splice(index, 1);
    saveProfileData();
    renderExperience();
  }
};

window.deleteEducationItem = function (index) {
  if (confirm("Delete this education record?")) {
    profileData.education.splice(index, 1);
    saveProfileData();
    renderEducation();
  }
};

window.deleteSkillItem = function (index) {
  if (confirm("Delete this skill?")) {
    profileData.skills.splice(index, 1);
    saveProfileData();
    renderSkills();
  }
};

window.deleteRec = async function (index) {
  if (confirm("Delete this recommendation?")) {
    const rec = profileData.recommendations[index];
    if (firebaseInitialized && rec && rec.id) {
      try {
        showToast('Deleting recommendation...');
        await deleteDoc(doc(db, "recommendations", rec.id));
        profileData.recommendations.splice(index, 1);
        renderRecommendations();
        showToast('Deleted from cloud.');
        return;
      } catch (err) {
        console.error("Firebase delete failed:", err);
        showToast('Delete failed: ' + err.message);
        return;
      }
    }

    profileData.recommendations.splice(index, 1);
    saveProfileData();
    renderRecommendations();
  }
};

// Expose open editors globally for inline buttons to trigger
window.openFeaturedEditor = openFeaturedEditor;
window.openExperienceEditor = openExperienceEditor;
window.openEducationEditor = openEducationEditor;
window.openSkillEditor = openSkillEditor;

/* --- COMPONENT INITIALIZATIONS --- */

function initThemeToggle() {
  const themeBtn = document.getElementById('themeToggleBtn');
  if (!themeBtn) return;

  // Load theme or check system default
  const savedTheme = localStorage.getItem('theme');
  let currentTheme = 'dark'; // default to dark for premium look

  if (savedTheme) {
    currentTheme = savedTheme;
  } else {
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    if (prefersLight) {
      currentTheme = 'light';
    }
  }

  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeBtnText(currentTheme === 'dark');

  themeBtn.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
      updateThemeBtnText(false);
      showToast('Switched to Light Theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
      updateThemeBtnText(true);
      showToast('Switched to Dark Theme');
    }
  });
}

function updateThemeBtnText(isDark) {
  const themeBtn = document.getElementById('themeToggleBtn');
  if (!themeBtn) return;
  themeBtn.innerHTML = isDark
    ? `<svg viewBox="0 0 24 24"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1z"/></svg> Light Mode`
    : `<svg viewBox="0 0 24 24"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4C12.92 3.04 12.46 3 12 3z"/></svg> Dark Mode`;
}

function initConnectButton() {
  const connectBtn = document.getElementById('connectBtn');
  if (!connectBtn) return;

  let state = 0; // 0: Connect, 1: Pending, 2: Connected

  connectBtn.addEventListener('click', () => {
    state = (state + 1) % 3;
    if (state === 1) {
      connectBtn.className = 'btn-secondary';
      connectBtn.innerHTML = `<span>Pending</span>`;
      showToast('Connection request sent');
    } else if (state === 2) {
      connectBtn.className = 'btn-outline';
      connectBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> <span>Connected</span>`;
      showToast('You are now connected!');
    } else {
      connectBtn.className = 'btn-primary';
      connectBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg> <span>Connect</span>`;
    }
  });
}

function initFloatingChat() {
  const chatWidget = document.getElementById('floatingChat');
  const chatHeader = document.getElementById('chatHeader');
  const openMessageBtns = document.querySelectorAll('.trigger-message');
  const chatInput = document.getElementById('chatInput');
  const chatSendBtn = document.getElementById('chatSendBtn');
  const chatBody = document.getElementById('chatBody');

  if (!chatWidget) return;

  chatHeader.addEventListener('click', () => {
    chatWidget.classList.toggle('open');
  });

  openMessageBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      chatWidget.classList.add('open');
      chatInput.focus();
    });
  });

  function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    const myMsg = document.createElement('div');
    myMsg.className = 'chat-bubble me';
    myMsg.textContent = text;
    chatBody.appendChild(myMsg);

    chatInput.value = '';
    chatBody.scrollTop = chatBody.scrollHeight;

    setTimeout(() => {
      const replyMsg = document.createElement('div');
      replyMsg.className = 'chat-bubble them';
      replyMsg.textContent = "Thanks for connecting! I'll get back to you shortly.";
      chatBody.appendChild(replyMsg);
      chatBody.scrollTop = chatBody.scrollHeight;
    }, 1000);
  }

  chatSendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

function initContactModal() {
  const modal = document.getElementById('contactModal');
  const openBtns = document.querySelectorAll('.trigger-contact-modal');
  const closeBtn = document.getElementById('closeContactModal');

  if (!modal) return;

  openBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modal.classList.add('open');
    });
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('open');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
    }
  });
}

function initExpandableText() {
  const seeMoreBtn = document.getElementById('aboutSeeMore');
  const content = document.getElementById('aboutContent');

  if (!seeMoreBtn || !content) return;

  seeMoreBtn.addEventListener('click', () => {
    const isCollapsed = content.classList.contains('collapsed');
    if (isCollapsed) {
      content.classList.remove('collapsed');
      seeMoreBtn.textContent = '...see less';
    } else {
      content.classList.add('collapsed');
      seeMoreBtn.textContent = '...see more';
    }
  });
}



function initAddRecommendationModal() {
  const modal = document.getElementById('addRecModal');
  const openBtn = document.getElementById('openAddRecModal');
  const closeBtn = document.getElementById('closeAddRecModal');
  const form = document.getElementById('addRecForm');

  if (!modal || !openBtn || !form) return;

  openBtn.addEventListener('click', () => {
    modal.classList.add('open');
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('open');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('open');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('recAuthorName').value.trim();
    const title = document.getElementById('recAuthorTitle').value.trim();
    const text = document.getElementById('recText').value.trim();

    if (!name || !title || !text) return;

    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

    const newRec = {
      author: name,
      title: title,
      text: text,
      avatar: initials,
      timestamp: Date.now()
    };

    if (!profileData.recommendations) {
      profileData.recommendations = [];
    }

    if (firebaseInitialized) {
      try {
        showToast('Submitting recommendation...');
        const docRef = await addDoc(collection(db, "recommendations"), newRec);
        newRec.id = docRef.id;
        profileData.recommendations.unshift(newRec);
        renderRecommendations();
        showToast('Recommendation submitted to Cloud!');
      } catch (err) {
        console.error("Firebase save failed:", err);
        showToast('Cloud save failed, saving locally.');
        profileData.recommendations.unshift(newRec);
        saveProfileData();
        renderRecommendations();
      }
    } else {
      profileData.recommendations.unshift(newRec);
      saveProfileData();
      renderRecommendations();
    }

    form.reset();
    modal.classList.remove('open');
    showToast('Recommendation submitted successfully!');
  });
}

function initPostLikes() {
  const likeBtns = document.querySelectorAll('.post-action-btn.like');
  likeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const isLiked = btn.classList.contains('liked');
      const countSpan = btn.querySelector('.like-count');
      let current = parseInt(countSpan.textContent, 10);

      if (isLiked) {
        btn.classList.remove('liked');
        countSpan.textContent = current - 1;
      } else {
        btn.classList.add('liked');
        countSpan.textContent = current + 1;
        showToast('Liked post!');
      }
    });
  });
}

/* --- UTILITY HELPERS --- */

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g,
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

function showToast(message) {
  let toast = document.getElementById('globalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.className = 'toast-container';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}
