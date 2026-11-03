with open('frontend/src/farmer/FarmerAddCrop.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

target1 = '{quality.quality_label || "Pending"}'
replacement1 = '{quality.result_metadata?.grade ? `${quality.result_metadata.grade} (${quality.quality_label})` : quality.quality_label || "Pending"}'

target2 = '<b>Explanation:</b> {quality.result_metadata?.reason || "Real-time visual quality inference completed."}'
replacement2 = '<b>Explanation:</b> {quality.result_metadata?.quality_description || quality.result_metadata?.reason || "Real-time visual quality inference completed."}'

target3 = '<span className="badge badge-sage">AI {quality.quality_label}</span>'
replacement3 = '<span className="badge badge-sage">AI {quality.result_metadata?.grade || (quality.quality_label === "Good" ? "Grade A" : quality.quality_label === "Average" ? "Grade B" : quality.quality_label === "Poor" ? "Grade C" : quality.quality_label)}</span>'

assert target1 in text, 'target1 not found'
assert target2 in text, 'target2 not found'
assert target3 in text, 'target3 not found'

text = text.replace(target1, replacement1, 1)
text = text.replace(target2, replacement2, 1)
text = text.replace(target3, replacement3, 1)

with open('frontend/src/farmer/FarmerAddCrop.jsx', 'w', encoding='utf-8') as f:
    f.write(text)

print('Updated FarmerAddCrop.jsx successfully')

