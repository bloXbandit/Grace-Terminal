
import sys
import os

# Add src to path just in case
sys.path.insert(0, os.path.abspath("SixTerminal/src"))

try:
    from xerparser import Xer
    import datetime
    
    print(f"datetime imported: {datetime}")
    print(f"datetime.datetime.now(): {datetime.datetime.now()}")

    xer_content = """%T	TASK
%F	task_id	task_code	task_name	status_code	task_type
%R	1	A100	Activity 1	TK_Active	TT_Task
%R	2	A101	Activity 2	TK_NotStart	TT_Mile
%T	PROJWBS
%F	wbs_id	proj_id	wbs_short_name	wbs_name
%R	1	1	WBS1	Phase 1
"""
    
    print("Parsing dummy XER content...")
    parser = Xer(xer_content)
    
    # Check attributes
    attrs = [a for a in dir(parser) if not a.startswith('_')]
    print(f"Parser attributes: {attrs}")
    
    if hasattr(parser, 'task'):
        print(f"Found 'task' attribute type: {type(parser.task)}")
        if isinstance(parser.task, list):
             print(f"First task: {vars(parser.task[0])}")
    else:
        print("'task' attribute missing")
        
    if hasattr(parser, 'tasks'):
        print(f"Found 'tasks' attribute type: {type(parser.tasks)}")
    else:
        print("'tasks' attribute missing")

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
