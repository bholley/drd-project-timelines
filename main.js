import './style.css'

// Function to parse CSV string into array of objects
function parseCSV(csv) {
  const lines = csv.split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const project = {
      name: values[0]
    };

    // Only add phases that have a valid owner
    const phases = ['design', 'estimating', 'production'];
    const phaseIndices = {
      design: [1, 2, 3],
      estimating: [4, 5, 6],
      production: [7, 8, 9]
    };

    phases.forEach((phase, index) => {
      const owner = values[phaseIndices[phase][0]];
      if (owner && owner.toLowerCase() !== 'n/a' && owner.trim() !== '') {
        project[phase] = {
          owner: owner,
          startDate: values[phaseIndices[phase][1]],
          endDate: values[phaseIndices[phase][2]]
        };
      }
    });
    
    return project;
  });
}

// Function to fetch and process the Google Sheet data
async function fetchProjectData() {
  const SHEET_ID = '1aKajaPbTyl0yzTMlu1QWhOdwCPIOypPhjc6jBCPQGds';
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
  
  try {
    const response = await fetch(SHEET_URL);
    if (!response.ok) throw new Error('Failed to fetch sheet data');
    const csvData = await response.text();
    return parseCSV(csvData);
  } catch (error) {
    console.error('Error fetching project data:', error);
    return [];
  }
}

// Extended color palette (30 distinct colors)
const colors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD', '#D4A5A5',
  '#FF9F1C', '#2EC4B6', '#E71D36', '#011627', '#7DCEA0', '#E8C547',
  '#4A90E2', '#50E3C2', '#B8E986', '#D6B1FF', '#FF9EAA', '#FFD93D',
  '#6C5CE7', '#A8E6CF', '#DCEDC1', '#FFD3B6', '#FFAAA5', '#98DDCA',
  '#D5ECC2', '#FFD3B5', '#FFAAA7', '#FF8B94', '#A8D8EA', '#FF61A6'
];

// Phase colors for the overview chart
const phaseColors = {
  design: '#4A90E2',
  estimating: '#50C878',
  production: '#FF6B6B'
};

function getPhaseData(projectsData, phase) {
  return projectsData
    .filter(project => project[phase]) // Only include projects that have this phase
    .map(project => ({
      name: project.name,
      owner: project[phase].owner,
      startDate: project[phase].startDate,
      endDate: project[phase].endDate
    }));
}

function doProjectsOverlap(project1, project2) {
  const start1 = new Date(project1.startDate);
  const end1 = new Date(project1.endDate);
  const start2 = new Date(project2.startDate);
  const end2 = new Date(project2.endDate);
  
  return start1 < end2 && start2 < end1;
}

function findAvailablePosition(project, placedProjects) {
  let position = 0;
  let positionTaken;
  
  do {
    positionTaken = false;
    for (const placedProject of placedProjects) {
      if (placedProject.position === position && doProjectsOverlap(project, placedProject)) {
        positionTaken = true;
        position++;
        break;
      }
    }
  } while (positionTaken);
  
  return position;
}

function getDateRange(projectsData) {
  let minDate = new Date('9999-12-31');
  let maxDate = new Date('1970-01-01');

  projectsData.forEach(project => {
    if (!project) return;
    
    ['design', 'estimating', 'production'].forEach(phase => {
      if (!project[phase]) return;
      
      const startDate = new Date(project[phase].startDate);
      const endDate = new Date(project[phase].endDate);
      
      if (!isNaN(startDate) && startDate < minDate) minDate = startDate;
      if (!isNaN(endDate) && endDate > maxDate) maxDate = endDate;
    });
  });

  // If no valid dates were found, use default range
  if (minDate > maxDate) {
    minDate = new Date();
    maxDate = new Date();
    maxDate.setMonth(maxDate.getMonth() + 6);
  }

  // Set dates to start of their respective months
  minDate.setDate(1);
  maxDate.setDate(1);
  maxDate.setMonth(maxDate.getMonth() + 1);

  return { startDate: minDate, endDate: maxDate };
}

function getMonthsBetweenDates(startDate, endDate) {
  const months = [];
  const currentDate = new Date(startDate);
  
  while (currentDate < endDate) {
    const monthLabel = currentDate.toLocaleString('default', { month: 'short' });
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const monthWidth = (daysInMonth / getDaysBetweenDates(startDate, endDate)) * 100;
    
    months.push({
      label: monthLabel,
      width: monthWidth
    });
    
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  
  return months;
}

function getDaysBetweenDates(startDate, endDate) {
  return Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
}

function createTimelineNavigation(chart, dateRange, updateView) {
  const nav = document.createElement('div');
  nav.className = 'timeline-navigation';
  
  const prevButton = document.createElement('button');
  prevButton.textContent = '← Previous';
  prevButton.className = 'nav-button';
  prevButton.onclick = () => {
    const newStartDate = new Date(chart.viewStartDate);
    newStartDate.setMonth(newStartDate.getMonth() - 1);
    if (newStartDate >= dateRange.startDate) {
      updateView(newStartDate);
    }
  };
  
  const nextButton = document.createElement('button');
  nextButton.textContent = 'Next →';
  nextButton.className = 'nav-button';
  nextButton.onclick = () => {
    const newStartDate = new Date(chart.viewStartDate);
    newStartDate.setMonth(newStartDate.getMonth() + 1);
    const viewEndDate = new Date(newStartDate);
    viewEndDate.setMonth(viewEndDate.getMonth() + 4);
    if (viewEndDate <= dateRange.endDate) {
      updateView(newStartDate);
    }
  };
  
  nav.appendChild(prevButton);
  nav.appendChild(nextButton);
  return nav;
}

function createGanttChart(projects, title, projectColors) {
  const dateRange = getDateRange(projects);
  const staff = [...new Set(projects.map(p => p.owner))];
  
  const chart = document.createElement('div');
  chart.className = 'gantt-chart';
  
  const phaseTitle = document.createElement('h2');
  phaseTitle.textContent = title;
  phaseTitle.className = 'phase-title';
  chart.appendChild(phaseTitle);
  
  // Initialize view with current month
  const now = new Date();
  now.setDate(1); // Set to start of month
  chart.viewStartDate = now;
  
  function updateView(newStartDate) {
    chart.viewStartDate = newStartDate;
    const viewEndDate = new Date(newStartDate);
    viewEndDate.setMonth(viewEndDate.getMonth() + 4);
    
    // Update timeline header
    const months = getMonthsBetweenDates(newStartDate, viewEndDate);
    timelineHeader.innerHTML = '';
    months.forEach(month => {
      const monthDiv = document.createElement('div');
      monthDiv.className = 'month';
      monthDiv.style.width = `${month.width}%`;
      monthDiv.textContent = month.label;
      timelineHeader.appendChild(monthDiv);
    });
    
    // Update project bars
    const totalDays = getDaysBetweenDates(newStartDate, viewEndDate);
    chartContent.querySelectorAll('.timeline').forEach(timeline => {
      timeline.innerHTML = '';
      const staffMember = timeline.parentElement.querySelector('.staff-name').textContent;
      const staffProjects = projects
        .filter(p => p.owner === staffMember)
        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
      
      const placedProjects = [];
      
      staffProjects.forEach(project => {
        const projectStart = new Date(project.startDate);
        const projectEnd = new Date(project.endDate);
        
        // Skip if project is outside view range
        if (projectEnd < newStartDate || projectStart > viewEndDate) return;
        
        const position = findAvailablePosition(project, placedProjects);
        placedProjects.push({ ...project, position });
        
        const left = Math.max(((projectStart - newStartDate) / (1000 * 60 * 60 * 24)) / totalDays * 100, 0);
        const width = Math.min(((projectEnd - Math.max(projectStart, newStartDate)) / (1000 * 60 * 60 * 24)) / totalDays * 100, 100);
        
        const projectBar = document.createElement('div');
        projectBar.className = 'project-bar';
        projectBar.style.left = left + '%';
        projectBar.style.width = width + '%';
        projectBar.style.backgroundColor = projectColors[project.name];
        projectBar.style.top = (position * 24) + 'px'; // 20px height + 4px margin
        
        projectBar.title = `${project.name}: ${project.startDate} to ${project.endDate}`;
        
        const label = document.createElement('span');
        label.className = 'project-label';
        label.textContent = project.name;
        projectBar.appendChild(label);
        
        timeline.appendChild(projectBar);
      });
      
      // Set timeline height based on number of projects
      const maxPosition = Math.max(...placedProjects.map(p => p.position), 0);
      timeline.style.height = ((maxPosition + 1) * 24 + 8) + 'px'; // (number of rows * (height + margin)) + padding
    });
  }
  
  const header = document.createElement('div');
  header.className = 'gantt-header';
  
  const staffHeader = document.createElement('div');
  staffHeader.className = 'staff-header';
  staffHeader.textContent = 'Staff';
  header.appendChild(staffHeader);
  
  const timelineHeader = document.createElement('div');
  timelineHeader.className = 'timeline-header';
  header.appendChild(timelineHeader);
  
  chart.appendChild(createTimelineNavigation(chart, dateRange, updateView));
  chart.appendChild(header);
  
  const chartContent = document.createElement('div');
  chartContent.className = 'chart-content';
  
  staff.forEach(staffMember => {
    const row = document.createElement('div');
    row.className = 'gantt-row';
    
    const staffName = document.createElement('div');
    staffName.className = 'staff-name';
    staffName.textContent = staffMember;
    row.appendChild(staffName);
    
    const timeline = document.createElement('div');
    timeline.className = 'timeline';
    row.appendChild(timeline);
    
    chartContent.appendChild(row);
  });
  
  chart.appendChild(chartContent);
  
  // Initialize the view
  updateView(chart.viewStartDate);
  
  return chart;
}

function createProjectOverviewChart(projectsData) {
  const dateRange = getDateRange(projectsData);
  const projects = [...new Set(projectsData.map(p => p.name))];
  
  const chart = document.createElement('div');
  chart.className = 'gantt-chart';
  
  // Initialize view with current month
  const now = new Date();
  now.setDate(1); // Set to start of month
  chart.viewStartDate = now;
  
  const phaseTitle = document.createElement('h2');
  phaseTitle.textContent = 'Project Overview';
  phaseTitle.className = 'phase-title';
  chart.appendChild(phaseTitle);
  
  function updateView(newStartDate) {
    chart.viewStartDate = newStartDate;
    const viewEndDate = new Date(newStartDate);
    viewEndDate.setMonth(viewEndDate.getMonth() + 4);
    
    const totalDays = getDaysBetweenDates(newStartDate, viewEndDate);
    
    // Update timeline header
    const months = getMonthsBetweenDates(newStartDate, viewEndDate);
    timelineHeader.innerHTML = '';
    months.forEach(month => {
      const monthDiv = document.createElement('div');
      monthDiv.className = 'month';
      monthDiv.style.width = `${month.width}%`;
      monthDiv.textContent = month.label;
      timelineHeader.appendChild(monthDiv);
    });
    
    // Update project bars
    chartContent.querySelectorAll('.timeline').forEach(timeline => {
      timeline.innerHTML = '';
      const projectName = timeline.parentElement.querySelector('.staff-name').textContent;
      const projectData = projectsData.find(p => p.name === projectName);
      
      let position = 0;
      ['design', 'estimating', 'production'].forEach(phase => {
        // Skip if phase doesn't exist
        if (!projectData[phase]) return;
        
        const phaseStart = new Date(projectData[phase].startDate);
        const phaseEnd = new Date(projectData[phase].endDate);
        
        // Skip if phase is outside view range
        if (phaseEnd < newStartDate || phaseStart > viewEndDate) return;
        
        const left = Math.max(((phaseStart - newStartDate) / (1000 * 60 * 60 * 24)) / totalDays * 100, 0);
        const width = Math.min(((phaseEnd - Math.max(phaseStart, newStartDate)) / (1000 * 60 * 60 * 24)) / totalDays * 100, 100);
        
        const phaseBar = document.createElement('div');
        phaseBar.className = 'project-bar';
        phaseBar.style.left = left + '%';
        phaseBar.style.width = width + '%';
        phaseBar.style.backgroundColor = phaseColors[phase];
        phaseBar.style.top = (position * 24) + 'px'; // 20px height + 4px margin
        
        phaseBar.title = `${phase}: ${projectData[phase].owner} (${projectData[phase].startDate} to ${projectData[phase].endDate})`;
        
        const label = document.createElement('span');
        label.className = 'project-label';
        label.textContent = projectData[phase].owner;
        phaseBar.appendChild(label);
        
        timeline.appendChild(phaseBar);
        position++;
      });
      
      // Set timeline height based on number of phases
      const numPhases = timeline.children.length;
      timeline.style.height = (numPhases * 24 + 8) + 'px'; // (number of phases * (height + margin)) + padding
    });
  }
  
  const header = document.createElement('div');
  header.className = 'gantt-header';
  
  const projectHeader = document.createElement('div');
  projectHeader.className = 'staff-header';
  projectHeader.textContent = 'Project';
  header.appendChild(projectHeader);
  
  const timelineHeader = document.createElement('div');
  timelineHeader.className = 'timeline-header';
  header.appendChild(timelineHeader);
  
  chart.appendChild(createTimelineNavigation(chart, dateRange, updateView));
  chart.appendChild(header);
  
  const chartContent = document.createElement('div');
  chartContent.className = 'chart-content';
  
  projects.forEach(projectName => {
    const row = document.createElement('div');
    row.className = 'gantt-row';
    
    const projectNameDiv = document.createElement('div');
    projectNameDiv.className = 'staff-name';
    projectNameDiv.textContent = projectName;
    row.appendChild(projectNameDiv);
    
    const timeline = document.createElement('div');
    timeline.className = 'timeline';
    row.appendChild(timeline);
    
    chartContent.appendChild(row);
  });
  
  chart.appendChild(chartContent);
  
  // Initialize the view
  updateView(chart.viewStartDate);
  
  return chart;
}

// Initialize the app
document.querySelector('#app').innerHTML = `
  <div class="container">
    <h1>DRD Project Timelines</h1>
    <div id="gantt-container"></div>
  </div>
`;

const container = document.getElementById('gantt-container');

const phases = [
  { name: 'design', title: 'Design Phase' },
  { name: 'estimating', title: 'Estimating Phase' },
  { name: 'production', title: 'Production Phase' }
];

// Fetch data and create charts
fetchProjectData().then(projectsData => {
  // Add the overview chart first
  container.appendChild(createProjectOverviewChart(projectsData));
  
  // Get all unique project names across all phases
  const allProjects = new Set();
  projectsData.forEach(project => {
    allProjects.add(project.name);
  });
  
  // Assign a unique color to each project
  const projectColors = {};
  Array.from(allProjects).forEach((projectName, index) => {
    projectColors[projectName] = colors[index % colors.length];
  });
  
  // Add the phase-specific charts
  phases.forEach(phase => {
    const phaseData = getPhaseData(projectsData, phase.name);
    container.appendChild(createGanttChart(phaseData, phase.title, projectColors));
  });
});